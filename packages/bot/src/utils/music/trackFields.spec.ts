import { describe, expect, it } from '@jest/globals'
import type { Track } from 'discord-player'
import { trackSource, trackAlbumName } from './trackFields'

// discord-player's `Track` is large and built by extractors at runtime; these
// helpers only read two loosely-typed fields, so a minimal cast is enough.
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
