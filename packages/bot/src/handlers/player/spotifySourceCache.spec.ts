import { beforeEach, describe, expect, it, jest } from '@jest/globals'

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
} from './spotifySourceCache'

const YT_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

// Each test that writes to L1 uses a unique URL so the module-level Map
// never carries state from a prior test.
let _urlCounter = 0
function freshUrl(): string {
    return `https://open.spotify.com/track/test-${++_urlCounter}`
}

beforeEach(() => {
    jest.clearAllMocks()
    mockRedisGet.mockResolvedValue(null)
    mockRedisSet.mockResolvedValue(undefined)
})

describe('isNegativeEntry', () => {
    it('returns true for NEGATIVE_SENTINEL', () => {
        expect(isNegativeEntry(NEGATIVE_SENTINEL)).toBe(true)
    })

    it('returns false for a YouTube URL', () => {
        expect(isNegativeEntry(YT_URL)).toBe(false)
    })

    it('returns false for an empty string', () => {
        expect(isNegativeEntry('')).toBe(false)
    })
})

describe('getSpotifySource', () => {
    it('returns null on a cold cache (L1 miss, Redis miss)', async () => {
        const result = await getSpotifySource(freshUrl())
        expect(result).toBeNull()
    })

    it('returns a YouTube URL from Redis and populates L1', async () => {
        const url = freshUrl()
        mockRedisGet.mockResolvedValue(YT_URL)

        const first = await getSpotifySource(url)
        expect(first).toBe(YT_URL)

        // Second call should hit L1 — Redis must not be called again.
        mockRedisGet.mockResolvedValue('different-value')
        const second = await getSpotifySource(url)
        expect(second).toBe(YT_URL)
        expect(mockRedisGet).toHaveBeenCalledTimes(1)
    })

    it('strips the ?si= tracking param before the Redis key lookup', async () => {
        const baseUrl = freshUrl()
        mockRedisGet.mockResolvedValue(YT_URL)

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
        await setSpotifySource(url, YT_URL)

        const result = await getSpotifySource(url)
        expect(result).toBe(YT_URL)
        expect(mockRedisGet).not.toHaveBeenCalled()
    })

    it('writes to Redis with the positive TTL', async () => {
        await setSpotifySource(freshUrl(), YT_URL)

        expect(mockRedisSet).toHaveBeenCalledWith(
            expect.stringContaining('spotify_src:'),
            YT_URL,
            24 * 60 * 60,
        )
    })

    it('logs a warning but does not throw when Redis set fails', async () => {
        mockRedisSet.mockRejectedValue(new Error('Redis down'))

        await expect(
            setSpotifySource(freshUrl(), YT_URL),
        ).resolves.toBeUndefined()
        expect(mockWarnLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('Redis set failed'),
            }),
        )
    })

    it('normalises the ?si= param before writing', async () => {
        const baseUrl = freshUrl()
        await setSpotifySource(`${baseUrl}?si=abc`, YT_URL)

        expect(mockRedisSet).toHaveBeenCalledWith(
            expect.not.stringContaining('si=abc'),
            YT_URL,
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
        await setSpotifySource(freshUrl(), YT_URL)
        const after = getSpotifySourceCacheL1Stats().size
        expect(after).toBe(before + 1)
    })
})
