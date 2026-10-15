import { describe, it, expect } from '@jest/globals'
import {
    artistKeyVariants,
    hasArtistKey,
    legacyArtistKey,
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

    it('finds an artist stored under either key form', () => {
        expect(hasArtistKey(new Set(['björk']), 'Björk')).toBe(true)
        expect(hasArtistKey(new Set(['bjrk']), 'Björk')).toBe(true)
        expect(hasArtistKey(new Set(['bjrk']), 'Taylor Swift')).toBe(false)
        expect(hasArtistKey(new Set(['']), '米津玄師')).toBe(false)
    })
})
