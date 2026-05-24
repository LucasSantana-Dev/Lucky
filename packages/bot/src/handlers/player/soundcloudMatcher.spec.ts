import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { PassThrough } from 'stream'

// --- mocks ---
const mockSearch = jest.fn()
const mockStream = jest.fn()

jest.mock('play-dl', () => ({
    search: (...args: unknown[]) => mockSearch(...args),
    stream: (...args: unknown[]) => mockStream(...args),
}))

import {
    streamViaSoundCloud,
    findMatchingSoundCloudResult,
    parseDurationString,
} from './soundcloudMatcher.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(
    name: string,
    durationInSec?: number,
): { name: string; url: string; durationInSec?: number } {
    return { name, url: `https://soundcloud.com/artist/${name}`, durationInSec }
}

const fakeReadable = new PassThrough()

// ---------------------------------------------------------------------------
// parseDurationString
// ---------------------------------------------------------------------------

describe('parseDurationString', () => {
    it('returns null for undefined', () => {
        expect(parseDurationString(undefined)).toBeNull()
    })

    it('returns null for empty string', () => {
        expect(parseDurationString('')).toBeNull()
    })

    it('parses MM:SS format', () => {
        expect(parseDurationString('3:30')).toBe(210)
    })

    it('parses HH:MM:SS format', () => {
        expect(parseDurationString('1:02:03')).toBe(3723)
    })

    it('handles zero-padded values', () => {
        expect(parseDurationString('0:05')).toBe(5)
    })

    it('returns null for non-numeric parts', () => {
        expect(parseDurationString('3:xx')).toBeNull()
    })

    it('returns null for a single segment (no colons)', () => {
        expect(parseDurationString('123')).toBeNull()
    })

    it('returns null for four-segment duration', () => {
        expect(parseDurationString('1:2:3:4')).toBeNull()
    })
})

// ---------------------------------------------------------------------------
// findMatchingSoundCloudResult — title matching
// ---------------------------------------------------------------------------

describe('findMatchingSoundCloudResult – title matching', () => {
    it('matches when all query tokens are in the result name', () => {
        const results = [makeResult('Song Name By Artist')]
        expect(
            findMatchingSoundCloudResult('song name', undefined, results),
        ).toBe(results[0])
    })

    it('returns undefined when query normalizes to empty', () => {
        const results = [makeResult('Song')]
        expect(
            findMatchingSoundCloudResult('!!!', undefined, results),
        ).toBeUndefined()
    })

    it('returns undefined when no result meets the 75% token threshold', () => {
        // query has 4 tokens, result matches only 1 (25%)
        const results = [makeResult('Song')]
        expect(
            findMatchingSoundCloudResult(
                'song name by artist',
                undefined,
                results,
            ),
        ).toBeUndefined()
    })

    it('matches when exactly 75% of tokens are present', () => {
        // 4 tokens, 3 matched = 75%
        const results = [makeResult('Song Name By')]
        expect(
            findMatchingSoundCloudResult(
                'song name by artist',
                undefined,
                results,
            ),
        ).toBe(results[0])
    })

    it('strips punctuation before comparing', () => {
        const results = [makeResult('Song: The Remix')]
        expect(
            findMatchingSoundCloudResult('song the remix', undefined, results),
        ).toBe(results[0])
    })

    it('is case-insensitive', () => {
        const results = [makeResult('SONG NAME')]
        expect(
            findMatchingSoundCloudResult('Song Name', undefined, results),
        ).toBe(results[0])
    })

    it('skips results whose normalized name is empty', () => {
        const results = [makeResult('!!!')]
        expect(
            findMatchingSoundCloudResult('song name', undefined, results),
        ).toBeUndefined()
    })
})

// ---------------------------------------------------------------------------
// findMatchingSoundCloudResult — duration matching
// ---------------------------------------------------------------------------

describe('findMatchingSoundCloudResult – duration matching', () => {
    it('accepts match within 30 seconds of track duration', () => {
        const results = [makeResult('Song', 200)] // 3:20
        expect(findMatchingSoundCloudResult('song', '3:30', results)).toBe(
            results[0],
        )
    })

    it('rejects match more than 30 seconds from track duration', () => {
        const results = [makeResult('Song', 169)] // 31s off
        expect(
            findMatchingSoundCloudResult('song', '3:30', results),
        ).toBeUndefined()
    })

    it('accepts exact boundary (30 seconds off)', () => {
        const results = [makeResult('Song', 180)] // exactly 30s off from 3:30 (210s)
        expect(findMatchingSoundCloudResult('song', '3:30', results)).toBe(
            results[0],
        )
    })

    it('skips duration check when trackDuration is missing', () => {
        const results = [makeResult('Song', 60)]
        expect(findMatchingSoundCloudResult('song', undefined, results)).toBe(
            results[0],
        )
    })

    it('skips duration check when result has no durationInSec', () => {
        const results = [makeResult('Song')]
        expect(findMatchingSoundCloudResult('song', '3:30', results)).toBe(
            results[0],
        )
    })

    it('skips duration check when trackDuration is unparseable', () => {
        const results = [makeResult('Song', 60)]
        expect(
            findMatchingSoundCloudResult('song', 'bad:duration', results),
        ).toBe(results[0])
    })

    it('returns first result that passes both title and duration checks', () => {
        const results = [
            makeResult('Song', 60), // title match, duration fails (150s off 3:30)
            makeResult('Song Name', 200), // title match, duration ok (10s off 3:30)
        ]
        const match = findMatchingSoundCloudResult('song name', '3:30', results)
        expect(match?.name).toBe('Song Name')
    })
})

// ---------------------------------------------------------------------------
// streamViaSoundCloud
// ---------------------------------------------------------------------------

describe('streamViaSoundCloud', () => {
    beforeEach(() => {
        mockStream.mockResolvedValue({ stream: fakeReadable })
    })

    it('throws on empty query', async () => {
        await expect(streamViaSoundCloud('')).rejects.toThrow(
            'SoundCloud: empty query',
        )
    })

    it('throws on whitespace-only query', async () => {
        await expect(streamViaSoundCloud('   ')).rejects.toThrow(
            'SoundCloud: empty query',
        )
    })

    it('throws when search returns no results', async () => {
        mockSearch.mockResolvedValue([])
        await expect(streamViaSoundCloud('some song', '3:30')).rejects.toThrow(
            'SoundCloud: no results for "some song"',
        )
    })

    it('throws when no result passes title/duration validation', async () => {
        // result name has no tokens in common with query
        mockSearch.mockResolvedValue([makeResult('Completely Different', 300)])
        await expect(streamViaSoundCloud('song name', '3:30')).rejects.toThrow(
            'SoundCloud: no validated match',
        )
    })

    it('returns the stream for a matching result', async () => {
        mockSearch.mockResolvedValue([makeResult('Song Name By Artist', 210)])
        const result = await streamViaSoundCloud('song name', '3:30')
        expect(result).toBe(fakeReadable)
    })

    it('wraps playdl.stream errors with context', async () => {
        mockSearch.mockResolvedValue([makeResult('Song Name', 210)])
        mockStream.mockRejectedValue(new Error('401 Unauthorized'))
        await expect(streamViaSoundCloud('song name', '3:30')).rejects.toThrow(
            'SoundCloud: stream creation failed for "Song Name" — 401 Unauthorized',
        )
    })

    it('successfully streams and passes correct search parameters', async () => {
        mockSearch.mockResolvedValue([makeResult('Song Name', 210)])
        const result = await streamViaSoundCloud('song name')

        // Verify the search was called with correct parameters
        expect(mockSearch).toHaveBeenCalledWith('song name', {
            source: { soundcloud: 'tracks' },
            limit: 5,
        })

        // Verify that a stream is returned
        expect(result).toBe(fakeReadable)
    })
})
