import { describe, expect, it, jest } from '@jest/globals'
import {
    AsmrBlockedError,
    assertNotAsmr,
    dropAsmrTracks,
    isAsmrTrack,
} from './asmrFilter'

describe('isAsmrTrack', () => {
    it('matches ASMR in the title or the artist, any case', () => {
        expect(
            isAsmrTrack({
                title: 'ASMR | VOCÊ SÓ VAI RELAXAR SE FOR UM "BOM GAROTO"',
                author: 'SakuraJu',
            }),
        ).toBe(true)
        expect(
            isAsmrTrack({ title: 'Nail Polish Brush', author: 'ASMR Bakery' }),
        ).toBe(true)
        expect(isAsmrTrack({ title: 'sleepy asmr', author: 'x' })).toBe(true)
        expect(isAsmrTrack({ title: 'x', author: 'GibiASMR' })).toBe(true)
    })

    it('leaves regular songs alone', () => {
        expect(isAsmrTrack({ title: 'Royals', author: 'Lorde' })).toBe(false)
        expect(isAsmrTrack({ title: undefined, author: undefined })).toBe(false)
    })
})

describe('assertNotAsmr', () => {
    const resultOf = (title: string, author = 'Artist') =>
        ({ tracks: [{ title, author }], hasPlaylist: () => false }) as never

    it('rejects a text search that asks for ASMR', () => {
        expect(() => assertNotAsmr('asmr good boy', resultOf('Song'))).toThrow(
            AsmrBlockedError,
        )
    })

    it('rejects a result whose top track is ASMR', () => {
        expect(() =>
            assertNotAsmr(
                'nail polish brush',
                resultOf('Nail Polish Brush', 'ASMR Bakery'),
            ),
        ).toThrow(AsmrBlockedError)
    })

    it('does not read a link as an ASMR query', () => {
        expect(() =>
            assertNotAsmr('https://youtu.be/asmrXYZ', resultOf('Royals')),
        ).not.toThrow()
    })

    it('lets a playlist through: its ASMR tracks are dropped when queued', () => {
        const playlist = {
            tracks: [{ title: 'ASMR intro', author: 'x' }],
            hasPlaylist: () => true,
        } as never
        expect(() => assertNotAsmr('my mix', playlist)).not.toThrow()
    })
})

describe('dropAsmrTracks', () => {
    it('removes only the ASMR tracks from the queue', () => {
        const asmr = { title: 'Nail Polish Brush', author: 'ASMR Bakery' }
        const song = { title: 'Royals', author: 'Lorde' }
        const queue = { guild: { id: 'g1' }, removeTrack: jest.fn() }

        dropAsmrTracks(queue as never, [asmr, song] as never)

        expect(queue.removeTrack).toHaveBeenCalledTimes(1)
        expect(queue.removeTrack).toHaveBeenCalledWith(asmr)
    })
})
