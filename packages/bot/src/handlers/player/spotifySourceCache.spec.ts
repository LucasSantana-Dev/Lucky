import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals'

const mockRedisGet = jest.fn()
const mockRedisSet = jest.fn()
const mockWarnLog = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    redisClient: {
        get: (...args: unknown[]) => mockRedisGet(...args),
        set: (...args: unknown[]) => mockRedisSet(...args),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    warnLog: (...args: unknown[]) => mockWarnLog(...args),
}))

import {
    getSpotifySource,
    setSpotifySource,
    setSpotifySourceNegative,
    isNegativeEntry,
    getSpotifySourceCacheL1Stats,
    NEGATIVE_SENTINEL,
    type SourceResolution,
} from './spotifySourceCache'

const YT_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
const YT: SourceResolution = {
    source: 'youtube',
    id: 'dQw4w9WgXcQ',
    matchedDurationSec: 213,
    method: 'ytdlp-search',
}
const YT_RAW = JSON.stringify(YT)

// Each test that writes to L1 uses a unique URL so the module-level Map
// never carries state from a prior test.
let _urlCounter = 0
function freshUrl(): string {
    return `https://open.spotify.com/track/test-${++_urlCounter}`
}

afterEach(() => {
    jest.useRealTimers()
})

beforeEach(() => {
    jest.clearAllMocks()
    mockRedisGet.mockResolvedValue(null)
    mockRedisSet.mockResolvedValue(undefined)
})

describe('isNegativeEntry', () => {
    it('returns true for NEGATIVE_SENTINEL', () => {
        expect(isNegativeEntry(NEGATIVE_SENTINEL)).toBe(true)
    })

    it('returns false for a resolution', () => {
        expect(isNegativeEntry(YT)).toBe(false)
    })

    it('returns false for a miss', () => {
        expect(isNegativeEntry(null)).toBe(false)
    })
})

describe('getSpotifySource', () => {
    it('returns null on a cold cache (L1 miss, Redis miss)', async () => {
        const result = await getSpotifySource(freshUrl())
        expect(result).toBeNull()
    })

    it('returns a YouTube URL from Redis and populates L1', async () => {
        const url = freshUrl()
        mockRedisGet.mockResolvedValue(YT_RAW)

        const first = await getSpotifySource(url)
        expect(first).toEqual(YT)

        // Second call should hit L1 — Redis must not be called again.
        mockRedisGet.mockResolvedValue('different-value')
        const second = await getSpotifySource(url)
        expect(second).toEqual(YT)
        expect(mockRedisGet).toHaveBeenCalledTimes(1)
    })

    it('strips the ?si= tracking param before the Redis key lookup', async () => {
        const baseUrl = freshUrl()
        mockRedisGet.mockResolvedValue(YT_RAW)

        await getSpotifySource(`${baseUrl}?si=tracking123`)

        expect(mockRedisGet).toHaveBeenCalledWith(
            expect.stringContaining(baseUrl),
        )
        expect(mockRedisGet).not.toHaveBeenCalledWith(
            expect.stringContaining('si=tracking123'),
        )
    })

    it('returns null and logs a warning when Redis throws', async () => {
        mockRedisGet.mockRejectedValue(new Error('Redis down'))

        const result = await getSpotifySource(freshUrl())
        expect(result).toBeNull()
        expect(mockWarnLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('Redis get failed'),
            }),
        )
    })

    it('handles a non-URL spotify string without throwing', async () => {
        await expect(getSpotifySource('not-a-url')).resolves.toBeNull()
    })
})

describe('setSpotifySource', () => {
    it('writes to L1 so the next getSpotifySource hits L1', async () => {
        const url = freshUrl()
        await setSpotifySource(url, YT)

        const result = await getSpotifySource(url)
        expect(result).toEqual(YT)
        expect(mockRedisGet).not.toHaveBeenCalled()
    })

    it('writes to Redis with the positive TTL', async () => {
        await setSpotifySource(freshUrl(), YT)

        expect(mockRedisSet).toHaveBeenCalledWith(
            expect.stringContaining('spotify_src:'),
            YT_RAW,
            24 * 60 * 60,
        )
    })

    it('logs a warning but does not throw when Redis set fails', async () => {
        mockRedisSet.mockRejectedValue(new Error('Redis down'))

        await expect(setSpotifySource(freshUrl(), YT)).resolves.toBeUndefined()
        expect(mockWarnLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('Redis set failed'),
            }),
        )
    })

    it('normalises the ?si= param before writing', async () => {
        const baseUrl = freshUrl()
        await setSpotifySource(`${baseUrl}?si=abc`, YT)

        expect(mockRedisSet).toHaveBeenCalledWith(
            expect.not.stringContaining('si=abc'),
            YT_RAW,
            expect.any(Number),
        )
    })
})

describe('setSpotifySourceNegative', () => {
    it('stores NEGATIVE_SENTINEL in L1', async () => {
        const url = freshUrl()
        await setSpotifySourceNegative(url)

        const result = await getSpotifySource(url)
        expect(result).toBe(NEGATIVE_SENTINEL)
    })

    it('writes NEGATIVE_SENTINEL to Redis with the short TTL', async () => {
        await setSpotifySourceNegative(freshUrl())

        expect(mockRedisSet).toHaveBeenCalledWith(
            expect.stringContaining('spotify_src:'),
            NEGATIVE_SENTINEL,
            5 * 60,
        )
    })

    it('logs a warning but does not throw when Redis set fails', async () => {
        mockRedisSet.mockRejectedValue(new Error('Redis down'))

        await expect(
            setSpotifySourceNegative(freshUrl()),
        ).resolves.toBeUndefined()
        expect(mockWarnLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('Redis set negative failed'),
            }),
        )
    })
})

describe('getSpotifySourceCacheL1Stats', () => {
    it('returns maxSize of 500', () => {
        const stats = getSpotifySourceCacheL1Stats()
        expect(stats.maxSize).toBe(500)
    })

    it('size increases after a new write', async () => {
        const before = getSpotifySourceCacheL1Stats().size
        await setSpotifySource(freshUrl(), YT)
        const after = getSpotifySourceCacheL1Stats().size
        expect(after).toBe(before + 1)
    })
})

describe('L1 expiry', () => {
    const FIVE_MIN_MS = 5 * 60 * 1000
    const FOUR_HOURS_MS = 4 * 60 * 60 * 1000

    it('keeps a positive entry for 4 h then falls through to Redis', async () => {
        jest.useFakeTimers()
        const url = freshUrl()
        await setSpotifySource(url, YT)

        jest.advanceTimersByTime(FOUR_HOURS_MS)
        expect(await getSpotifySource(url)).toEqual(YT)
        expect(mockRedisGet).not.toHaveBeenCalled()

        jest.advanceTimersByTime(1)
        expect(await getSpotifySource(url)).toBeNull()
        expect(mockRedisGet).toHaveBeenCalledTimes(1)
    })

    it('expires a negative entry from L1 after 5 min, like Redis', async () => {
        jest.useFakeTimers()
        const url = freshUrl()
        await setSpotifySourceNegative(url)

        jest.advanceTimersByTime(FIVE_MIN_MS)
        expect(await getSpotifySource(url)).toBe(NEGATIVE_SENTINEL)
        expect(mockRedisGet).not.toHaveBeenCalled()

        jest.advanceTimersByTime(1)
        expect(await getSpotifySource(url)).toBeNull()
        expect(mockRedisGet).toHaveBeenCalledTimes(1)
    })

    it('hydrates a negative Redis value into L1 with the 5 min TTL', async () => {
        jest.useFakeTimers()
        const url = freshUrl()
        mockRedisGet.mockResolvedValueOnce(NEGATIVE_SENTINEL)
        expect(await getSpotifySource(url)).toBe(NEGATIVE_SENTINEL)

        jest.advanceTimersByTime(FIVE_MIN_MS)
        expect(await getSpotifySource(url)).toBe(NEGATIVE_SENTINEL)
        expect(mockRedisGet).toHaveBeenCalledTimes(1)

        jest.advanceTimersByTime(1)
        expect(await getSpotifySource(url)).toBeNull()
        expect(mockRedisGet).toHaveBeenCalledTimes(2)
    })

    it('hydrates a positive Redis value into L1 with the 4 h TTL', async () => {
        jest.useFakeTimers()
        const url = freshUrl()
        mockRedisGet.mockResolvedValueOnce(YT_RAW)
        expect(await getSpotifySource(url)).toEqual(YT)

        jest.advanceTimersByTime(FOUR_HOURS_MS)
        expect(await getSpotifySource(url)).toEqual(YT)
        expect(mockRedisGet).toHaveBeenCalledTimes(1)
    })

    it('replaces a negative L1 entry with a positive one on overwrite', async () => {
        jest.useFakeTimers()
        const url = freshUrl()
        await setSpotifySourceNegative(url)
        await setSpotifySource(url, YT)

        jest.advanceTimersByTime(FIVE_MIN_MS + 1)
        expect(await getSpotifySource(url)).toEqual(YT)
        expect(mockRedisGet).not.toHaveBeenCalled()
    })
})

describe('L1 capacity', () => {
    it('evicts the oldest entry at 500 and keeps the size bounded', async () => {
        // Fill to the cap so earlier tests' leftovers do not matter.
        const { maxSize } = getSpotifySourceCacheL1Stats()
        const first = freshUrl()
        await setSpotifySource(first, YT)
        for (let i = 0; i < maxSize; i++) {
            await setSpotifySource(freshUrl(), YT)
        }

        expect(getSpotifySourceCacheL1Stats().size).toBe(maxSize)
        mockRedisGet.mockClear()
        expect(await getSpotifySource(first)).toBeNull()
        expect(mockRedisGet).toHaveBeenCalledTimes(1)
    })

    it('overwriting an existing key at capacity evicts nothing else', async () => {
        const { maxSize } = getSpotifySourceCacheL1Stats()
        const urls: string[] = []
        for (let i = 0; i < maxSize; i++) {
            const url = freshUrl()
            urls.push(url)
            await setSpotifySource(url, YT)
        }
        const oldest = urls[0]
        const newest = urls[urls.length - 1]
        expect(getSpotifySourceCacheL1Stats().size).toBe(maxSize)

        // Rewriting the newest key must not push the oldest one out.
        await setSpotifySource(newest, { ...YT, id: 'new' })

        expect(getSpotifySourceCacheL1Stats().size).toBe(maxSize)
        mockRedisGet.mockClear()
        expect(await getSpotifySource(oldest)).toEqual(YT)
        expect(mockRedisGet).not.toHaveBeenCalled()
        expect(await getSpotifySource(newest)).toEqual({ ...YT, id: 'new' })
    })

    it('refreshes recency on read so a read entry survives eviction', async () => {
        const { maxSize } = getSpotifySourceCacheL1Stats()
        const keep = freshUrl()
        await setSpotifySource(keep, YT)
        for (let i = 0; i < maxSize - 1; i++) {
            await setSpotifySource(freshUrl(), YT)
        }
        await getSpotifySource(keep) // now most recently used
        await setSpotifySource(freshUrl(), YT) // forces one eviction

        mockRedisGet.mockClear()
        expect(await getSpotifySource(keep)).toEqual(YT)
        expect(mockRedisGet).not.toHaveBeenCalled()
    })
})

describe('ISRC-keyed resolutions', () => {
    const SC: SourceResolution = {
        source: 'soundcloud',
        id: 'https://soundcloud.com/artist/song',
        matchedDurationSec: 201,
        method: 'soundcloud-title',
    }
    let _isrcCounter = 0
    function freshIsrc(): string {
        return `USRC1${String(++_isrcCounter).padStart(7, '0')}`
    }

    it('writes the resolution under both the ISRC key and the URL key', async () => {
        const url = freshUrl()
        const isrc = freshIsrc()
        await setSpotifySource(url, SC, isrc)

        expect(mockRedisSet).toHaveBeenCalledTimes(2)
        expect(mockRedisSet).toHaveBeenCalledWith(
            `lucky:spotify_src:isrc:${isrc}`,
            JSON.stringify(SC),
            24 * 60 * 60,
        )
        expect(mockRedisSet).toHaveBeenCalledWith(
            `lucky:spotify_src:${url}`,
            JSON.stringify(SC),
            24 * 60 * 60,
        )
    })

    it('stores identifiers only, never a stream URL', async () => {
        await setSpotifySource(freshUrl(), SC, freshIsrc())

        const stored = JSON.parse(mockRedisSet.mock.calls[0][1] as string)
        expect(Object.keys(stored).sort()).toEqual(
            ['id', 'matchedDurationSec', 'method', 'source'].sort(),
        )
    })

    it('answers another release of the same recording from the ISRC key', async () => {
        const isrc = freshIsrc()
        await setSpotifySource(freshUrl(), SC, isrc)

        // A different Spotify track id (album vs single), same ISRC.
        expect(await getSpotifySource(freshUrl(), isrc)).toEqual(SC)
        expect(mockRedisGet).not.toHaveBeenCalled()
    })

    it('reads the ISRC key from Redis before the URL key', async () => {
        const url = freshUrl()
        const isrc = freshIsrc()
        mockRedisGet.mockResolvedValueOnce(JSON.stringify(SC))

        expect(await getSpotifySource(url, isrc)).toEqual(SC)
        expect(mockRedisGet).toHaveBeenCalledTimes(1)
        expect(mockRedisGet).toHaveBeenCalledWith(
            `lucky:spotify_src:isrc:${isrc}`,
        )
    })

    it('falls back to the URL key when the ISRC key misses', async () => {
        const url = freshUrl()
        const isrc = freshIsrc()
        mockRedisGet
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(JSON.stringify(SC))

        expect(await getSpotifySource(url, isrc)).toEqual(SC)
        expect(mockRedisGet).toHaveBeenNthCalledWith(
            2,
            `lucky:spotify_src:${url}`,
        )
    })

    it('uses only the URL key when the ISRC is unknown', async () => {
        const url = freshUrl()
        await setSpotifySource(url, SC, null)

        expect(mockRedisSet).toHaveBeenCalledTimes(1)
        expect(mockRedisSet).toHaveBeenCalledWith(
            `lucky:spotify_src:${url}`,
            JSON.stringify(SC),
            24 * 60 * 60,
        )
    })

    it('writes a negative entry under both keys with the short TTL', async () => {
        const isrc = freshIsrc()
        await setSpotifySourceNegative(freshUrl(), isrc)

        expect(mockRedisSet).toHaveBeenCalledTimes(2)
        expect(mockRedisSet).toHaveBeenCalledWith(
            `lucky:spotify_src:isrc:${isrc}`,
            NEGATIVE_SENTINEL,
            5 * 60,
        )
    })

    it('reads a pre-ISRC bare YouTube URL entry as a YouTube resolution', async () => {
        mockRedisGet.mockResolvedValueOnce(YT_URL)

        expect(await getSpotifySource(freshUrl())).toEqual({
            source: 'youtube',
            id: 'dQw4w9WgXcQ',
            method: 'legacy',
        })
    })

    it.each([
        ['malformed JSON', '{not json'],
        ['unknown source', JSON.stringify({ ...SC, source: 'deezer' })],
        ['missing id', JSON.stringify({ source: 'youtube', method: 'x' })],
        ['not a URL', 'garbage'],
    ])('treats %s as a miss', async (_label, raw) => {
        mockRedisGet.mockResolvedValueOnce(raw)

        expect(await getSpotifySource(freshUrl())).toBeNull()
    })
})
