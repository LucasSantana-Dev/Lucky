import { redisClient } from '@lucky/shared/services'
import { warnLog } from '@lucky/shared/utils'

const L1_MAX_SIZE = 500
const L1_TTL_MS = 4 * 60 * 60 * 1000 // 4 h
const REDIS_POSITIVE_TTL_S = 24 * 60 * 60 // 24 h
const REDIS_NEGATIVE_TTL_S = 5 * 60 // 5 min
const REDIS_PREFIX = 'lucky:spotify_src:'

// Stored in both L1 and Redis to mark a Spotify track that couldn't be
// resolved — skips the full yt-dlp+SoundCloud ladder on the next play.
export const NEGATIVE_SENTINEL = '__neg__'

type L1Entry = { value: string; expiresAt: number }

// LRU implemented as an insertion-order Map: the oldest entry is always
// first, so eviction is O(1).
const l1 = new Map<string, L1Entry>()

// Strip Spotify's `?si=` affiliate/tracking param so the same track resolves
// to the same cache key regardless of how the link was shared.
function normalizeCacheKey(spotifyUrl: string): string {
    try {
        const u = new URL(spotifyUrl)
        u.searchParams.delete('si')
        return u.toString()
    } catch {
        return spotifyUrl
    }
}

function l1Get(key: string): string | null {
    const entry = l1.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
        l1.delete(key)
        return null
    }
    // Move to end: most-recently-used survives eviction longest.
    l1.delete(key)
    l1.set(key, entry)
    return entry.value
}

function l1Set(key: string, value: string): void {
    if (l1.size >= L1_MAX_SIZE) {
        const oldest = l1.keys().next().value
        if (oldest !== undefined) l1.delete(oldest)
    }
    l1.delete(key)
    l1.set(key, { value, expiresAt: Date.now() + L1_TTL_MS })
}

export function isNegativeEntry(value: string): boolean {
    return value === NEGATIVE_SENTINEL
}

/**
 * Returns the cached YouTube URL for a Spotify track URL, or
 * `NEGATIVE_SENTINEL` when a prior attempt failed, or `null` on a cache miss.
 */
export async function getSpotifySource(
    spotifyUrl: string,
): Promise<string | null> {
    const key = normalizeCacheKey(spotifyUrl)

    const l1Value = l1Get(key)
    if (l1Value !== null) return l1Value

    try {
        const redisValue = await redisClient.get(`${REDIS_PREFIX}${key}`)
        if (redisValue !== null) {
            l1Set(key, redisValue)
            return redisValue
        }
    } catch (error) {
        warnLog({ message: 'Spotify source cache: Redis get failed', error })
    }
    return null
}

export async function setSpotifySource(
    spotifyUrl: string,
    youtubeUrl: string,
): Promise<void> {
    const key = normalizeCacheKey(spotifyUrl)
    l1Set(key, youtubeUrl)
    try {
        await redisClient.set(
            `${REDIS_PREFIX}${key}`,
            youtubeUrl,
            REDIS_POSITIVE_TTL_S,
        )
    } catch (error) {
        warnLog({ message: 'Spotify source cache: Redis set failed', error })
    }
}

export async function setSpotifySourceNegative(
    spotifyUrl: string,
): Promise<void> {
    const key = normalizeCacheKey(spotifyUrl)
    l1Set(key, NEGATIVE_SENTINEL)
    try {
        await redisClient.set(
            `${REDIS_PREFIX}${key}`,
            NEGATIVE_SENTINEL,
            REDIS_NEGATIVE_TTL_S,
        )
    } catch (error) {
        warnLog({
            message: 'Spotify source cache: Redis set negative failed',
            error,
        })
    }
}

export function getSpotifySourceCacheL1Stats(): {
    size: number
    maxSize: number
} {
    return { size: l1.size, maxSize: L1_MAX_SIZE }
}
