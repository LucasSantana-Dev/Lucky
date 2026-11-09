import type { Track } from 'discord-player'
import { redisClient } from '@lucky/shared/services'
import { debugLog, warnLog } from '@lucky/shared/utils'
import { withTimeout } from './withTimeout'

// discord-player-spotify 1.1.9 maps a Spotify track to name, duration,
// artists, url and cover only: external_ids (the ISRC) is dropped. The ISRC
// names the recording, so it keys the resolution cache across the single,
// album and compilation releases of one song, and it is what a later ISRC
// search stage will query. It is read here from GET /v1/tracks/{id} through
// the registered extractor's own fetchData, so the extractor's token is
// reused and the 429 block in spotifyApiFailureLog (Retry-After included)
// applies: while Spotify is blocked the lookup fails fast with no request.

export const ISRC_METADATA_KEY = 'isrc'

const SPOTIFY_TRACKS_ENDPOINT = 'https://api.spotify.com/v1/tracks/'
const REDIS_PREFIX = 'lucky:spotify_isrc:'
// A track id's ISRC does not change, so a hit is kept long and saves a
// Spotify call (and development mode quota) on every replay.
const REDIS_ISRC_TTL_S = 30 * 24 * 60 * 60 // 30 days
// Spotify answered and the track has no ISRC (local files, some podcasts):
// asking again soon gets the same answer.
const REDIS_NO_ISRC_TTL_S = 24 * 60 * 60 // 24 h
const NO_ISRC = '__none__'
// The lookup runs on the /play path before any stream stage, so it gets a
// small budget: a slow Spotify answer costs at most this much latency.
export const SPOTIFY_ISRC_LOOKUP_TIMEOUT_MS = 1_500

// ISO 3901: country (2 letters), registrant (3 alphanumerics), year (2
// digits), designation (5 digits).
const ISRC_PATTERN = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/
const SPOTIFY_TRACK_ID_PATTERN = /^[A-Za-z0-9]{22}$/

type SpotifyFetch = (url: string) => Promise<Response>

let spotifyApi: { fetchData: SpotifyFetch } | null = null

/**
 * Called once the SpotifyExtractor is registered (after
 * logSpotifyApiFailures wrapped its fetchData). fetchData is looked up at
 * call time, so the wrapper is always the one used.
 */
export function useSpotifyApiForIsrc(extractor: unknown): void {
    const api = (extractor as { internal?: { fetchData?: unknown } } | null)
        ?.internal
    spotifyApi =
        api && typeof api.fetchData === 'function'
            ? (api as { fetchData: SpotifyFetch })
            : null
}

export function resetSpotifyIsrcForTests(): void {
    spotifyApi = null
}

/** Upper case, no hyphens or spaces; null when it is not a valid ISRC. */
export function normalizeIsrc(raw: unknown): string | null {
    if (typeof raw !== 'string') return null
    const isrc = raw.replaceAll(/[-\s]/g, '').toUpperCase()
    return ISRC_PATTERN.test(isrc) ? isrc : null
}

/** The base62 track id of an open.spotify.com track URL, or null. */
export function spotifyTrackIdFromUrl(url: string | undefined): string | null {
    if (!url) return null
    try {
        const { hostname, pathname } = new URL(url)
        if (hostname !== 'open.spotify.com') return null
        // Share links can carry a locale segment: /intl-pt/track/<id>.
        const segments = pathname.split('/').filter(Boolean)
        const at = segments.indexOf('track')
        const id = at >= 0 ? segments[at + 1] : undefined
        return id && SPOTIFY_TRACK_ID_PATTERN.test(id) ? id : null
    } catch {
        return null
    }
}

/** The ISRC already stored on the track, or null. */
export function trackIsrc(track: { metadata?: unknown }): string | null {
    const metadata = track.metadata
    if (typeof metadata !== 'object' || metadata === null) return null
    return normalizeIsrc(
        (metadata as Record<string, unknown>)[ISRC_METADATA_KEY],
    )
}

async function fetchIsrc(api: { fetchData: SpotifyFetch }, trackId: string) {
    const response = await api.fetchData(
        `${SPOTIFY_TRACKS_ENDPOINT}${encodeURIComponent(trackId)}`,
    )
    const body = (await response.json()) as {
        external_ids?: { isrc?: unknown }
    } | null
    return normalizeIsrc(body?.external_ids?.isrc)
}

/**
 * The ISRC of a Spotify track id: Redis first, then the Spotify Web API.
 * Null when the track has none or the lookup failed. Only a definite answer
 * from Spotify is cached; a 429, timeout or network error is not, so the
 * next play asks again (after the 429 block lifts).
 */
export async function lookupSpotifyIsrc(
    trackId: string,
): Promise<string | null> {
    const key = `${REDIS_PREFIX}${trackId}`
    try {
        const cached = await redisClient.get(key)
        if (cached !== null) return cached === NO_ISRC ? null : cached
    } catch (error) {
        warnLog({ message: 'Spotify ISRC cache: Redis get failed', error })
    }

    const api = spotifyApi
    if (!api) return null

    const startedAt = Date.now()
    let isrc: string | null
    try {
        isrc = await withTimeout(
            fetchIsrc(api, trackId),
            SPOTIFY_ISRC_LOOKUP_TIMEOUT_MS,
            'Spotify ISRC lookup',
        )
    } catch (error) {
        // HTTP failures are already logged (rate limited) by
        // spotifyApiFailureLog; this only adds which lookup gave up.
        debugLog({
            message: 'Spotify ISRC lookup failed',
            data: {
                trackId,
                error: (error as Error).message,
                durationMs: Date.now() - startedAt,
            },
        })
        return null
    }

    try {
        await redisClient.set(
            key,
            isrc ?? NO_ISRC,
            isrc ? REDIS_ISRC_TTL_S : REDIS_NO_ISRC_TTL_S,
        )
    } catch (error) {
        warnLog({ message: 'Spotify ISRC cache: Redis set failed', error })
    }
    return isrc
}

/**
 * Makes sure a Spotify track carries its ISRC in metadata.isrc and returns
 * it. Never throws: a missing ISRC only means the resolution cache falls
 * back to the Spotify URL key.
 */
export async function ensureSpotifyIsrc(
    track: Pick<Track, 'url' | 'metadata' | 'setMetadata'>,
): Promise<string | null> {
    const known = trackIsrc(track)
    if (known) return known
    const trackId = spotifyTrackIdFromUrl(track.url)
    if (!trackId) return null
    const isrc = await lookupSpotifyIsrc(trackId).catch(() => null)
    if (!isrc) return null
    const existing =
        typeof track.metadata === 'object' && track.metadata !== null
            ? (track.metadata as Record<string, unknown>)
            : {}
    track.setMetadata({ ...existing, [ISRC_METADATA_KEY]: isrc })
    return isrc
}
