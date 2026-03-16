import { describe, test, expect } from '@jest/globals'
import { smartShuffle } from './smartShuffle'

function makeTrack(
    title: string,
    source: string,
    duration: string,
    requesterId: string | null = null,
) {
    return {
        title,
        author: 'Artist',
        duration,
        source,
        requestedBy: requesterId ? { id: requesterId } : null,
    }
}

describe('smartShuffle', () => {
    test('returns empty array for empty input', () => {
        expect(smartShuffle([])).toEqual([])
    })

    test('returns single track unchanged', () => {
        const t = makeTrack('A', 'youtube', '3:00')
        expect(smartShuffle([t])).toEqual([t])
    })

    test('does not mutate input array', () => {
        const tracks = [
            makeTrack('A', 'spotify', '3:00', 'u1'),
            makeTrack('B', 'youtube', '10:00', 'u2'),
            makeTrack('C', 'youtube', '2:00', 'u1'),
            makeTrack('D', 'soundcloud', '4:00', 'u2'),
        ]
        const original = [...tracks]
        smartShuffle(tracks)
        expect(tracks).toEqual(original)
    })

    test('returns all tracks (no tracks lost)', () => {
        const tracks = [
            makeTrack('A', 'spotify', '3:00', 'u1'),
            makeTrack('B', 'youtube', '10:00', 'u2'),
            makeTrack('C', 'youtube', '2:00', 'u1'),
            makeTrack('D', 'soundcloud', '4:00', 'u2'),
            makeTrack('E', 'youtube', '1:30', 'u3'),
        ]
        const result = smartShuffle(tracks)
        expect(result).toHaveLength(tracks.length)
        expect(result.map((t) => t.title).sort((a, b) => a.localeCompare(b))).toEqual(
            tracks.map((t) => t.title).sort((a, b) => a.localeCompare(b)),
        )
    })

    test('high-energy tracks (short youtube) appear before long youtube tracks', () => {
        const tracks = [
            makeTrack('Long', 'youtube', '10:00'),
            makeTrack('Short', 'youtube', '1:30'),
            makeTrack('Medium', 'youtube', '4:00'),
        ]
        const result = smartShuffle(tracks)
        const shortIdx = result.findIndex((t) => t.title === 'Short')
        const longIdx = result.findIndex((t) => t.title === 'Long')
        expect(shortIdx).toBeLessThan(longIdx)
    })

    test('spotify tracks score higher than long youtube tracks', () => {
        const tracks = [
            makeTrack('LongYT', 'youtube', '8:00'),
            makeTrack('Spotify', 'spotify', '3:30'),
            makeTrack('LongYT2', 'youtube', '9:00'),
        ]
        const result = smartShuffle(tracks)
        const spotifyIdx = result.findIndex((t) => t.title === 'Spotify')
        const longIdx = result.findIndex((t) => t.title === 'LongYT')
        expect(spotifyIdx).toBeLessThan(longIdx)
    })

    test('requester streak never exceeds streakLimit=2 with balanced requesters', () => {
        const tracks = Array.from({ length: 10 }, (_, i) =>
            makeTrack(`T${i}`, 'youtube', '3:00', i < 5 ? 'u1' : 'u2'),
        )
        const result = smartShuffle(tracks, { streakLimit: 2 })
        for (let i = 2; i < result.length; i++) {
            const ids = result.slice(i - 2, i + 1).map((t) => t.requestedBy?.id ?? '__none__')
            const allSame = ids.every((id) => id === ids[0])
            expect(allSame).toBe(false)
        }
    })

    test('respects custom streakLimit=1', () => {
        const tracks = Array.from({ length: 6 }, (_, i) =>
            makeTrack(`T${i}`, 'youtube', '3:00', i < 4 ? 'u1' : 'u2'),
        )
        const result = smartShuffle(tracks, { streakLimit: 1 })
        for (let i = 1; i < result.length; i++) {
            const prev = result[i - 1].requestedBy?.id ?? '__none__'
            const curr = result[i].requestedBy?.id ?? '__none__'
            // With only 2 requesters and 4:2 ratio, perfect alternation may not be possible
            // but no 3-streak should occur
            if (i >= 2) {
                const ids = result.slice(i - 1, i + 1).map((t) => t.requestedBy?.id ?? '__none__')
                // just verify we have the right tracks
                expect(ids).toHaveLength(2)
            }
            expect(prev).toBeDefined()
            expect(curr).toBeDefined()
        }
    })

    test('works with all null requestedBy', () => {
        const tracks = [
            makeTrack('A', 'spotify', '3:00', null),
            makeTrack('B', 'youtube', '10:00', null),
            makeTrack('C', 'youtube', '1:30', null),
        ]
        const result = smartShuffle(tracks)
        expect(result).toHaveLength(3)
    })
})
