import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { PassThrough } from 'stream'

// --- mocks ---
const mockSearch = jest.fn()
const mockStream = jest.fn()
const mockGetFreeClientID = jest.fn()
const mockSetToken = jest.fn()
const mockInfoLog = jest.fn()
const mockWarnLog = jest.fn()

jest.mock('play-dl', () => ({
    search: (...args: unknown[]) => mockSearch(...args),
    stream: (...args: unknown[]) => mockStream(...args),
    getFreeClientID: (...args: unknown[]) => mockGetFreeClientID(...args),
    setToken: (...args: unknown[]) => mockSetToken(...args),
}))
jest.mock('@lucky/shared/utils', () => ({
    infoLog: (...args: unknown[]) => mockInfoLog(...args),
    warnLog: (...args: unknown[]) => mockWarnLog(...args),
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

    it('prefers the closest duration among multiple qualifying candidates, not just the first', () => {
        const results = [
            makeResult('Song Name (Sped Up)', 195), // 15s off 3:30 (210s)
            makeResult('Song Name', 208), // 2s off — closer, but ranked second by SoundCloud
            makeResult('Song Name (8D Audio)', 225), // 15s off
        ]
        const match = findMatchingSoundCloudResult('song name', '3:30', results)
        expect(match?.name).toBe('Song Name')
    })

    it('picks the first of multiple duration-less candidates when none can be ranked by duration', () => {
        const results = [makeResult('Song Name'), makeResult('Song Name Live')]
        const match = findMatchingSoundCloudResult('song name', '3:30', results)
        expect(match?.name).toBe('Song Name')
    })

    it('prefers an exact title match with no duration data over a looser title match with duration', () => {
        // 4 query tokens: 'song name original mix'. The remix result is
        // missing "original" (3/4 = 75%, just clears the threshold); the
        // duration-less result matches all 4 tokens (100%).
        const results = [
            makeResult('Song Name Mix', 215), // 75% title score, 5s off
            makeResult('Song Name Original Mix'), // 100% title score, no duration data
        ]
        const match = findMatchingSoundCloudResult(
            'song name original mix',
            '3:30',
            results,
        )
        expect(match?.name).toBe('Song Name Original Mix')
    })

    it('at equal title score, prefers the duration-bearing candidate over the duration-less one', () => {
        const results = [
            makeResult('Song Name'), // exact title, no duration
            makeResult('Song Name', 215), // exact title, has duration (5s off)
        ]
        const match = findMatchingSoundCloudResult('song name', '3:30', results)
        expect(match?.durationInSec).toBe(215)
    })

    it('falls back to a candidate with no duration data when it is the only match', () => {
        const results = [makeResult('Song Name')] // no durationInSec at all
        const match = findMatchingSoundCloudResult('song name', '3:30', results)
        expect(match?.name).toBe('Song Name')
    })
})

// ---------------------------------------------------------------------------
// streamViaSoundCloud
// ---------------------------------------------------------------------------

describe('streamViaSoundCloud', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockStream.mockResolvedValue({ stream: fakeReadable })
        mockGetFreeClientID.mockResolvedValue('fresh-client-id')
        mockSetToken.mockResolvedValue(undefined)
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

// ---------------------------------------------------------------------------
// #2139 — the boot-scraped client id expires; the bridge must recover instead
// of failing every fallback for the rest of the process lifetime.
// ---------------------------------------------------------------------------

describe('streamViaSoundCloud – client id refresh', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockStream.mockResolvedValue({ stream: fakeReadable })
        mockGetFreeClientID.mockResolvedValue('fresh-client-id')
        mockSetToken.mockResolvedValue(undefined)
    })

    it('refreshes the client id and retries once when search fails', async () => {
        mockSearch
            .mockRejectedValueOnce(new Error('401 Unauthorized'))
            .mockResolvedValueOnce([makeResult('Song Name', 210)])

        const result = await streamViaSoundCloud('song name', '3:30')

        expect(result).toBe(fakeReadable)
        expect(mockGetFreeClientID).toHaveBeenCalledTimes(1)
        expect(mockSetToken).toHaveBeenCalledWith({
            soundcloud: { client_id: 'fresh-client-id' },
        })
        expect(mockSearch).toHaveBeenCalledTimes(2)
    })

    it('refreshes the client id and retries once when stream creation fails', async () => {
        mockSearch.mockResolvedValue([makeResult('Song Name', 210)])
        mockStream
            .mockRejectedValueOnce(new Error('401 Unauthorized'))
            .mockResolvedValueOnce({ stream: fakeReadable })

        const result = await streamViaSoundCloud('song name', '3:30')

        expect(result).toBe(fakeReadable)
        expect(mockGetFreeClientID).toHaveBeenCalledTimes(1)
        expect(mockStream).toHaveBeenCalledTimes(2)
    })

    it('does not refresh when the search succeeds but genuinely has no results', async () => {
        mockSearch.mockResolvedValue([])

        await expect(streamViaSoundCloud('song name', '3:30')).rejects.toThrow(
            'SoundCloud: no results for "song name"',
        )
        expect(mockGetFreeClientID).not.toHaveBeenCalled()
    })

    it('does not refresh when the search succeeds but nothing validates', async () => {
        mockSearch.mockResolvedValue([makeResult('Completely Different', 300)])

        await expect(streamViaSoundCloud('song name', '3:30')).rejects.toThrow(
            'SoundCloud: no validated match',
        )
        expect(mockGetFreeClientID).not.toHaveBeenCalled()
    })

    it('surfaces the original failure, not the refresh failure', async () => {
        mockSearch.mockRejectedValue(new Error('401 Unauthorized'))
        mockGetFreeClientID.mockRejectedValue(new Error('soundcloud.com down'))

        await expect(streamViaSoundCloud('song name', '3:30')).rejects.toThrow(
            '401 Unauthorized',
        )
        // One attempt only: the retry is skipped when recovery failed.
        expect(mockSearch).toHaveBeenCalledTimes(1)
    })

    it('propagates the retry failure when the refreshed id is still rejected', async () => {
        mockSearch.mockRejectedValue(new Error('401 Unauthorized'))

        await expect(streamViaSoundCloud('song name', '3:30')).rejects.toThrow(
            '401 Unauthorized',
        )
        expect(mockGetFreeClientID).toHaveBeenCalledTimes(1)
        expect(mockSearch).toHaveBeenCalledTimes(2)
    })

    it('scrapes a single id when concurrent calls fail together', async () => {
        mockSearch
            .mockRejectedValueOnce(new Error('401 Unauthorized'))
            .mockRejectedValueOnce(new Error('401 Unauthorized'))
            .mockResolvedValue([makeResult('Song Name', 210)])

        let releaseScrape: (id: string) => void = () => {}
        mockGetFreeClientID.mockReturnValue(
            new Promise<string>((resolve) => {
                releaseScrape = resolve
            }),
        )

        const both = Promise.all([
            streamViaSoundCloud('song name', '3:30'),
            streamViaSoundCloud('song name', '3:30'),
        ])
        await Promise.resolve()
        releaseScrape('fresh-client-id')

        await expect(both).resolves.toEqual([fakeReadable, fakeReadable])
        expect(mockGetFreeClientID).toHaveBeenCalledTimes(1)
    })
})
