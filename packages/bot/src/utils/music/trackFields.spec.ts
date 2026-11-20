import { describe, expect, it } from '@jest/globals'
import type { Track } from 'discord-player'
import { trackSource, trackAlbumName, trackAlbumPosition } from './trackFields'

const asTrack = (partial: Partial<Track>): Track => partial as Track

describe('trackSource', () => {
    it('returns the source value', () => {
        expect(trackSource(asTrack({ source: 'spotify' }))).toBe('spotify')
    })

    it('returns undefined when source is absent', () => {
        expect(trackSource(asTrack({}))).toBeUndefined()
    })

    it('returns undefined when source is null or not a string', () => {
        expect(trackSource(asTrack({ source: null as never }))).toBeUndefined()
        expect(trackSource(asTrack({ source: 7 as never }))).toBeUndefined()
    })
})

describe('trackAlbumName', () => {
    it('reads album.name from the raw payload', () => {
        const track = asTrack({ raw: { album: { name: 'Discovery' } } })
        expect(trackAlbumName(track)).toBe('Discovery')
    })

    it('returns undefined when raw, album, or name is missing', () => {
        expect(trackAlbumName(asTrack({}))).toBeUndefined()
        expect(trackAlbumName(asTrack({ raw: {} }))).toBeUndefined()
        expect(trackAlbumName(asTrack({ raw: { album: {} } }))).toBeUndefined()
    })

    it('returns undefined when name is not a string', () => {
        const track = asTrack({ raw: { album: { name: 42 as never } } })
        expect(trackAlbumName(track)).toBeUndefined()
    })
})

describe('trackAlbumPosition', () => {
    const album = (type: string) => ({
        type,
        title: 'Abbey Road',
        tracks: [{ url: 'u1' }, { url: 'u2' }, { url: 'u3' }],
    })

    it('reads the album title and track number from the playlist', () => {
        const track = asTrack({
            url: 'u2',
            playlist: album('album') as never,
        })
        expect(trackAlbumPosition(track)).toEqual({
            album: 'Abbey Road',
            position: 2,
            total: 3,
        })
    })

    it('returns undefined for a loose track or a regular playlist', () => {
        expect(trackAlbumPosition(asTrack({ url: 'u2' }))).toBeUndefined()
        expect(
            trackAlbumPosition(
                asTrack({ url: 'u2', playlist: album('playlist') as never }),
            ),
        ).toBeUndefined()
    })

    it('returns undefined when the track is not in the album listing', () => {
        const track = asTrack({ url: 'u9', playlist: album('album') as never })
        expect(trackAlbumPosition(track)).toBeUndefined()
    })
})
