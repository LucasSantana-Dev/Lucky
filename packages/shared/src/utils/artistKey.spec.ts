import { describe, it, expect } from '@jest/globals'
import {
    artistKeyVariants,
    hasArtistKey,
    legacyArtistKey,
    lookupArtistKey,
    normalizeArtistKey,
    staleLegacyKeys,
} from './artistKey'

describe('artistKey', () => {
    it.each([
        ['Björk', 'björk'],
        ['Sigur Rós', 'sigurrós'],
        ['米津玄師', '米津玄師'],
        ['AC/DC', 'acdc'],
        ['!!!', ''],
        ['\u0301\u0308', ''],
    ])('normalizeArtistKey(%s) is %s', (name: string, key: string) => {
        expect(normalizeArtistKey(name)).toBe(key)
    })

    it('matches NFC and NFD spellings of the same name', () => {
        expect(normalizeArtistKey('Björk')).toBe(normalizeArtistKey('Björk'))
    })

    it('keeps combining marks that NFKC does not compose', () => {
        expect(normalizeArtistKey('कु')).not.toBe(normalizeArtistKey('क'))
    })

    it('derives the legacy key from the raw and the normalized spelling', () => {
        expect(artistKeyVariants('Bjo\u0308rk')).toEqual([
            'björk',
            'bjork',
            'bjrk',
        ])
    })

    it('only treats legacy rows of the same artist as stale', () => {
        const rows = [
            { artistKey: 'bjrk', artistName: 'Björk' },
            { artistKey: 'bjork', artistName: 'Bjork' },
            { artistKey: 'björk', artistName: 'Björk' },
        ]
        expect(staleLegacyKeys(rows, 'björk')).toEqual(['bjrk'])
    })

    it('keeps the pre-Unicode ASCII rule for legacy rows', () => {
        expect(legacyArtistKey('Björk')).toBe('bjrk')
    })

    it.each([
        ['Björk', ['björk', 'bjrk']],
        ['Taylor Swift', ['taylorswift']],
        ['米津玄師', ['米津玄師']],
        ['!!!', []],
    ])('artistKeyVariants(%s)', (name: string, variants: string[]) => {
        expect(artistKeyVariants(name)).toEqual(variants)
    })

    it.each([
        ['legacy NFC row', { artistKey: 'bjrk', artistName: 'Björk' }, 'björk'],
        [
            'legacy NFD row',
            { artistKey: 'bjork', artistName: 'Bjo\u0308rk' },
            'björk',
        ],
        ['ASCII artist', { artistKey: 'bjork', artistName: 'Bjork' }, 'bjork'],
        ['current row', { artistKey: 'björk', artistName: 'Björk' }, 'björk'],
        ['non-name key', { artistKey: 'drake', artistName: 'Drake!' }, 'drake'],
    ])('lookupArtistKey maps a %s', (_, row, key) => {
        expect(lookupArtistKey(row)).toBe(key)
    })

    it('matches only the current key', () => {
        expect(hasArtistKey(new Set(['björk']), 'Björk')).toBe(true)
        expect(hasArtistKey(new Set(['bjork']), 'Bjo\u0308rk')).toBe(false)
        expect(hasArtistKey(new Set(['björk']), 'Bjork')).toBe(false)
        expect(hasArtistKey(new Set(['']), '!!!')).toBe(false)
    })
})
