import { redisClient } from '@lucky/shared/services'
import { warnLog } from '@lucky/shared/utils'

const L1_MAX_SIZE = 500
const L1_TTL_MS = 4 * 60 * 60 * 1000 // 4 h
const REDIS_POSITIVE_TTL_S = 24 * 60 * 60 // 24 h
const REDIS_NEGATIVE_TTL_S = 5 * 60 // 5 min
// L1 negatives expire with the Redis negative TTL: a failed lookup must not
// stay pinned in memory for hours after Redis already forgot it.
const L1_NEGATIVE_TTL_MS = REDIS_NEGATIVE_TTL_S * 1000
const REDIS_PREFIX = 'lucky:spotify_src:'
// ISRC keys live under the same prefix; a Spotify URL key always starts
// with "https:", so the two never collide.
const ISRC_KEY_PREFIX = 'isrc:'

// Stored in both L1 and Redis to mark a Spotify track that couldn't be
// resolved — skips the full yt-dlp+SoundCloud ladder on the next play.
export const NEGATIVE_SENTINEL = '__neg__'

/**
 * Where a Spotify track was last resolved. Identifiers only (a YouTube video
 * id, a SoundCloud track permalink), never a stream URL: those are signed
 * and expire long before the entry does.
 */
export type SourceResolution = {
    source: 'youtube' | 'soundcloud'
    id: string
    matchedDurationSec?: number
    /** Bridge stage that found it, e.g. ytdlp-search or soundcloud-title. */
    method: string
}

export type SpotifySourceEntry = SourceResolution | typeof NEGATIVE_SENTINEL

type L1Entry = { value: string; expiresAt: number }

// LRU implemented as an insertion-order Map: the oldest entry is always
// first, so eviction is O(1).
const l1 = new Map<string, L1Entry>()

// Strip Spotify's `?si=` affiliate/tracking param so the same track resolves
// to the same cache key regardless of how the link was shared.
export function normalizeCacheKey(spotifyUrl: string): string {
    try {
        const u = new URL(spotifyUrl)
        u.searchParams.delete('si')
        return u.toString()
    } catch {
        return spotifyUrl
    }
}

// The ISRC key comes first: it is shared by every release of the recording.
// The URL key still answers when the ISRC lookup failed or Spotify has none.
function cacheKeys(spotifyUrl: string, isrc?: string | null): string[] {
    const urlKey = normalizeCacheKey(spotifyUrl)
    return isrc ? [`${ISRC_KEY_PREFIX}${isrc}`, urlKey] : [urlKey]
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
    // Delete first so overwriting an existing key never evicts another entry.
    l1.delete(key)
    if (l1.size >= L1_MAX_SIZE) {
        const oldest = l1.keys().next().value
        if (oldest !== undefined) l1.delete(oldest)
    }
    const ttlMs = value === NEGATIVE_SENTINEL ? L1_NEGATIVE_TTL_MS : L1_TTL_MS
    l1.set(key, { value, expiresAt: Date.now() + ttlMs })
}

export function isNegativeEntry(
    value: SpotifySourceEntry | null,
): value is typeof NEGATIVE_SENTINEL {
    return value === NEGATIVE_SENTINEL
}

function legacyYouTubeEntry(value: string): SourceResolution | null {
    try {
        const id = new URL(value).searchParams.get('v')
        return id ? { source: 'youtube', id, method: 'legacy' } : null
    } catch {
        return null
    }
}

// Entries written before the ISRC change hold a bare YouTube watch URL; they
// expire within 24 h of the deploy and read as YouTube resolutions until
// then. Anything unreadable is a miss.
export function parseEntry(value: string): SpotifySourceEntry | null {
    if (value === NEGATIVE_SENTINEL) return NEGATIVE_SENTINEL
    if (!value.startsWith('{')) return legacyYouTubeEntry(value)
    try {
        const parsed = JSON.parse(value) as Partial<SourceResolution>
        if (
            (parsed.source === 'youtube' || parsed.source === 'soundcloud') &&
            typeof parsed.id === 'string' &&
            parsed.id !== '' &&
            typeof parsed.method === 'string'
        ) {
            return {
                source: parsed.source,
                id: parsed.id,
                method: parsed.method,
                ...(typeof parsed.matchedDurationSec === 'number'
                    ? { matchedDurationSec: parsed.matchedDurationSec }
                    : {}),
            }
        }
    } catch {
        // fall through to a miss
    }
    return null
}

async function readKey(key: string): Promise<SpotifySourceEntry | null> {
    const l1Value = l1Get(key)
    if (l1Value !== null) return parseEntry(l1Value)
    try {
        const redisValue = await redisClient.get(`${REDIS_PREFIX}${key}`)
        if (redisValue !== null) {
            l1Set(key, redisValue)
            return parseEntry(redisValue)
        }
    } catch (error) {
        warnLog({ message: 'Spotify source cache: Redis get failed', error })
    }
    return null
}

async function writeKeys(
    keys: string[],
    value: string,
    ttlS: number,
    failureMessage: string,
): Promise<void> {
    for (const key of keys) l1Set(key, value)
    try {
        await Promise.all(
            keys.map((key) =>
                redisClient.set(`${REDIS_PREFIX}${key}`, value, ttlS),
            ),
        )
    } catch (error) {
        warnLog({ message: failureMessage, error })
    }
}

/**
 * Returns where a Spotify track was last resolved, `NEGATIVE_SENTINEL` when
 * a prior attempt failed, or `null` on a cache miss. Looks up the ISRC key
 * first when the ISRC is known, then the Spotify URL key.
 */
export async function getSpotifySource(
    spotifyUrl: string,
    isrc?: string | null,
): Promise<SpotifySourceEntry | null> {
    for (const key of cacheKeys(spotifyUrl, isrc)) {
        const entry = await readKey(key)
        if (entry !== null) return entry
    }
    return null
}

export async function setSpotifySource(
    spotifyUrl: string,
    resolution: SourceResolution,
    isrc?: string | null,
): Promise<void> {
    await writeKeys(
        cacheKeys(spotifyUrl, isrc),
        JSON.stringify(resolution),
        REDIS_POSITIVE_TTL_S,
        'Spotify source cache: Redis set failed',
    )
}

export async function setSpotifySourceNegative(
    spotifyUrl: string,
    isrc?: string | null,
): Promise<void> {
    await writeKeys(
        cacheKeys(spotifyUrl, isrc),
        NEGATIVE_SENTINEL,
        REDIS_NEGATIVE_TTL_S,
        'Spotify source cache: Redis set negative failed',
    )
}

export function getSpotifySourceCacheL1Stats(): {
    size: number
    maxSize: number
} {
    return { size: l1.size, maxSize: L1_MAX_SIZE }
}
