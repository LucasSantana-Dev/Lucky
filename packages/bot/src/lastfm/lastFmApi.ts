/**
 * Last.fm API client for updateNowPlaying and scrobble.
 * Supports per-user session keys (from DB) and fallback to env LASTFM_SESSION_KEY.
 * See https://www.last.fm/api and https://www.last.fm/api/authspec (Section 8: signing).
 */

import crypto from 'node:crypto'
import { LRUCache } from 'lru-cache'
import { lastFmLinkService } from '@lucky/shared/services'
import { logAndSwallow, logAndWarn } from '@lucky/shared/utils/error'
import { debugLog } from '@lucky/shared/utils/general/log'

const API_BASE = 'https://ws.audioscrobbler.com/2.0/'

/**
 * Error thrown when Last.fm session key has expired (error code 9).
 * Caller should re-authenticate the user.
 */
export class LastFmSessionExpiredError extends Error {
    constructor(message = 'Last.fm session key has expired (error code 9)') {
        super(message)
        this.name = 'LastFmSessionExpiredError'
    }
}

function getApiConfig(): { apiKey: string; secret: string } | null {
    const apiKey = process.env.LASTFM_API_KEY
    const secret = process.env.LASTFM_API_SECRET
    if (!apiKey || !secret) return null
    return { apiKey, secret }
}

export function isLastFmConfigured(): boolean {
    return getApiConfig() !== null
}

export async function getSessionKeyForUser(
    discordId: string | undefined,
    options?: { allowEnvFallback?: boolean },
): Promise<string | null> {
    const config = getApiConfig()
    if (!config) return null
    const allowEnvFallback = options?.allowEnvFallback ?? true

    if (discordId) {
        const fromDb = await lastFmLinkService.getSessionKey(discordId)
        if (fromDb) return fromDb
        if (!allowEnvFallback) return null
    }

    if (!allowEnvFallback) return null
    const fromEnv = process.env.LASTFM_SESSION_KEY
    return fromEnv ?? null
}

function buildSignature(
    params: Record<string, string>,
    secret: string,
): string {
    const keys = Object.keys(params)
        .filter((k) => k !== 'format' && k !== 'callback')
        .sort((a, b) => a.localeCompare(b))
    const str = keys.map((k) => `${k}${params[k]}`).join('') + secret
    return crypto.createHash('md5').update(str, 'utf8').digest('hex')
}

async function signedPost(
    method: string,
    params: Record<string, string>,
    sessionKey: string,
): Promise<void> {
    const config = getApiConfig()
    if (!config) return
    const { apiKey, secret } = config
    const body: Record<string, string> = {
        method,
        api_key: apiKey,
        sk: sessionKey,
        ...params,
    }
    body.api_sig = buildSignature(body, secret)
    body.format = 'json'
    const form = new URLSearchParams(body).toString()
    const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
        signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
        const text = await res.text()
        throw new Error(`Last.fm ${method}: ${res.status} ${text}`)
    }
    const data = (await res.json().catch(() => ({}))) as {
        error?: number
        message?: string
    }
    if (data.error) {
        if (data.error === 9) {
            throw new LastFmSessionExpiredError()
        }
        throw new Error(
            `Last.fm ${method}: ${data.error} - ${data.message ?? ''}`,
        )
    }
}

const TOPIC_SUFFIX = / - topic$/i
const ARTIST_SEPARATORS = /\s*[,/]\s*/
const TITLE_NOISE_PARENS =
    /\s*[([](official(?:\s+music)?\s+video|official\s+audio|audio|lyric\s+video|lyrics?|live|hd|4k|ft\.?[^)\]]*|feat\.?[^)\]]*)[)\]]/gi
const FEAT_CLAUSE = /(?:[\[(]feat\.?\s+[^\])[]+[\])]|\bfeat\.?\s+[^\s,([]+)/gi

export function normalizeLastFmArtist(raw: string): string {
    return raw.replace(TOPIC_SUFFIX, '').split(ARTIST_SEPARATORS)[0].trim()
}

export function normalizeLastFmTitle(raw: string): string {
    return raw.replace(TITLE_NOISE_PARENS, '').replace(FEAT_CLAUSE, '').trim()
}

export type LastFmTrackMetadata = {
    artist: string
    title: string
    album: string
    albumArtist: string
    mbid: string
    duration: number
}

// Whitespace bounds use bounded repetition (S5852) so the matcher remains
// strictly linear regardless of input. Last.fm artist strings rarely contain
// runs of internal whitespace, so {0,4}/{1,4} comfortably covers real input.
const FEAT_ARTIST_SEPARATORS =
    /\s{0,4}(?:feat\.?|ft\.?|&|×|\bx\b|\bvs\.?|\bwith\b)\s{1,4}/i

export function parseArtists(raw: string): {
    primary: string
    featured: string[]
} {
    const normalized = normalizeLastFmArtist(raw)
    const parts = normalized
        .split(FEAT_ARTIST_SEPARATORS)
        .map((s) => s.trim())
        .filter(Boolean)
    return { primary: parts[0] ?? normalized, featured: parts.slice(1) }
}

const TRACK_METADATA_CACHE = new LRUCache<string, LastFmTrackMetadata>({
    max: 5000,
    ttl: 24 * 60 * 60 * 1000,
})
const TRACK_METADATA_IN_FLIGHT = new Map<
    string,
    Promise<LastFmTrackMetadata | null>
>()

export async function getTrackMetadata(
    artist: string,
    title: string,
): Promise<LastFmTrackMetadata | null> {
    const config = getApiConfig()
    if (!config) return null
    // Bail before allocating cache / in-flight slots so blank inputs don't
    // pollute the maps or burn a Last.fm request.
    const trimmedArtist = artist?.trim()
    const trimmedTitle = title?.trim()
    if (!trimmedArtist || !trimmedTitle) return null
    const key = `${trimmedArtist.toLowerCase()}::${trimmedTitle.toLowerCase()}`
    const cached = TRACK_METADATA_CACHE.get(key)
    if (cached) return cached

    // Deduplicate concurrent fetches
    const inFlight = TRACK_METADATA_IN_FLIGHT.get(key)
    if (inFlight) return inFlight

    // Last.fm's track.getInfo does not handle collaboration strings —
    // "Drake feat. Rihanna" returns error 6 (Track not found). Use the
    // primary artist so multi-artist inputs still resolve metadata + art.
    const lookupArtist = parseArtists(trimmedArtist).primary
    const promise = (async () => {
        try {
            const response = await fetch(
                `${API_BASE}?method=track.getInfo&artist=${encodeURIComponent(lookupArtist)}&track=${encodeURIComponent(trimmedTitle)}&autocorrect=1&format=json&api_key=${config.apiKey}`, // NOSONAR
                { signal: AbortSignal.timeout(15_000) },
            )
            if (!response.ok) {
                debugLog({
                    message: 'lastFmApi: getTrackMetadata HTTP error',
                    data: {
                        status: response.status,
                        statusText: response.statusText,
                    },
                })
                return null
            }
            const data = (await response.json()) as {
                error?: number
                track?: {
                    name: string
                    artist: { name: string }
                    album?: { title: string; artist?: string }
                    mbid?: string
                    duration?: string
                }
            }
            if (data.error || !data.track) return null
            const t = data.track
            const album = t.album?.title || ''
            const albumArtist = t.album?.artist || ''
            const mbid = t.mbid || ''
            const durationNum = t.duration ? parseInt(t.duration, 10) || 0 : 0
            const meta: LastFmTrackMetadata = {
                artist: t.artist.name,
                title: t.name,
                album,
                albumArtist,
                mbid,
                duration: durationNum,
            }
            TRACK_METADATA_CACHE.set(key, meta)
            return meta
        } catch (err) {
            logAndSwallow(err, 'lastfm.getTrackMetadata', {
                artist: trimmedArtist,
                title: trimmedTitle,
            })
            return null
        }
    })()

    TRACK_METADATA_IN_FLIGHT.set(key, promise)
    try {
        return await promise
    } finally {
        TRACK_METADATA_IN_FLIGHT.delete(key)
    }
}

/**
 * Test-only: reset the module-level metadata caches so each test starts with
 * a clean slate. The maps are intentionally module-private at runtime; this
 * helper exists purely to keep `lastFmApi.spec.ts` test cases isolated.
 */
export function __resetMetadataCacheForTests(): void {
    TRACK_METADATA_CACHE.clear()
    TRACK_METADATA_IN_FLIGHT.clear()
}

export type LastFmTopTrack = {
    artist: string
    title: string
    playCount: number
}
export type LastFmPeriod = '7day' | '1month' | '3month' | '6month' | '12month'

export async function getTopTracks(
    lastFmUsername: string,
    period: LastFmPeriod = '3month',
    limit = 20,
): Promise<LastFmTopTrack[]> {
    const config = getApiConfig()
    if (!config) return []
    const params = new URLSearchParams({
        method: 'user.getTopTracks',
        user: lastFmUsername,
        period,
        limit: String(limit),
        api_key: config.apiKey,
        format: 'json',
    })
    try {
        const res = await fetch(`${API_BASE}?${params.toString()}`, {
            signal: AbortSignal.timeout(15_000),
        })
        if (!res.ok) return []
        const data = (await res.json()) as {
            toptracks?: {
                track?: Array<{
                    name: string
                    artist: { name: string }
                    playcount: string
                }>
            }
        }
        return (data.toptracks?.track ?? []).map((t) => ({
            artist: t.artist.name,
            title: t.name,
            playCount: parseInt(t.playcount, 10) || 0,
        }))
    } catch (err) {
        logAndWarn(err, 'lastfm.getTopTracks')
        return []
    }
}

export async function updateNowPlaying(
    artist: string,
    track: string,
    durationSec?: number,
    sessionKey?: string | null,
    metadata?: LastFmTrackMetadata,
): Promise<void> {
    if (!sessionKey || !getApiConfig()) return
    if (!artist?.trim() || !track?.trim()) return
    const params: Record<string, string> = {
        // Prefer Last.fm's canonical (autocorrected) artist/title when a
        // resolved metadata payload is supplied; only fall back to local
        // parsing when the caller had no metadata to thread through.
        artist: metadata?.artist?.trim() || parseArtists(artist).primary,
        track: metadata?.title?.trim() || normalizeLastFmTitle(track),
    }
    if (durationSec != null && durationSec > 0) {
        params.duration = String(Math.round(durationSec))
    }
    if (metadata?.album) params.album = metadata.album
    if (metadata?.albumArtist) params.albumArtist = metadata.albumArtist
    if (metadata?.mbid) params.mbid = metadata.mbid
    await signedPost('track.updateNowPlaying', params, sessionKey)
}

export async function scrobble(
    artist: string,
    track: string,
    timestamp: number,
    durationSec?: number,
    sessionKey?: string | null,
    metadata?: LastFmTrackMetadata,
): Promise<void> {
    if (!sessionKey || !getApiConfig()) return
    if (!artist?.trim() || !track?.trim()) return
    const params: Record<string, string> = {
        // Prefer Last.fm's canonical (autocorrected) artist/title when a
        // resolved metadata payload is supplied; only fall back to local
        // parsing when the caller had no metadata to thread through.
        artist: metadata?.artist?.trim() || parseArtists(artist).primary,
        track: metadata?.title?.trim() || normalizeLastFmTitle(track),
        timestamp: String(Math.floor(timestamp)),
    }
    if (durationSec != null && durationSec > 0) {
        params.duration = String(Math.round(durationSec))
    }
    if (metadata?.album) params.album = metadata.album
    if (metadata?.albumArtist) params.albumArtist = metadata.albumArtist
    if (metadata?.mbid) params.mbid = metadata.mbid
    await signedPost('track.scrobble', params, sessionKey)
}

export function isLastFmInvalidSessionError(error: unknown): boolean {
    if (error instanceof LastFmSessionExpiredError) return true
    if (!(error instanceof Error)) return false

    const message = error.message.toLowerCase()
    const hasErrorCodeNine = /"error"\s*:\s*9/.test(message)
    return (
        message.includes('invalid session key') ||
        hasErrorCodeNine ||
        message.includes(' 9 - ')
    )
}

export async function getRecentTracks(
    lastFmUsername: string,
    limit = 20,
): Promise<{ artist: string; title: string }[]> {
    const config = getApiConfig()
    if (!config) return []
    try {
        const response = await fetch(
            `${API_BASE}?method=user.getrecenttracks&user=${encodeURIComponent(lastFmUsername)}&limit=${limit}&format=json&api_key=${config.apiKey}`,
            { signal: AbortSignal.timeout(15_000) },
        )
        if (!response.ok) {
            debugLog({
                message: 'lastFmApi: getRecentTracks HTTP error',
                data: {
                    status: response.status,
                    statusText: response.statusText,
                },
            })
            return []
        }
        const data = (await response.json()) as {
            recenttracks?: {
                track?: Array<{
                    name: string
                    artist: { name: string } | string
                    '@attr'?: { nowplaying: string }
                }>
            }
        }
        return (data.recenttracks?.track ?? [])
            .filter((t) => !t['@attr']?.nowplaying)
            .map((t) => ({
                artist:
                    typeof t.artist === 'string'
                        ? t.artist
                        : ((t.artist as Record<string, string>)['#text'] ??
                          t.artist.name ??
                          ''),
                title: t.name,
            }))
    } catch (err) {
        logAndWarn(err, 'lastfm.getRecentTracks', { username: lastFmUsername })
        return []
    }
}

const ARTIST_TAG_CACHE = new LRUCache<string, string[]>({
    max: 5000,
    ttl: 24 * 60 * 60 * 1000,
})
const ARTIST_TAG_IN_FLIGHT = new Map<string, Promise<string[]>>()

export async function getArtistTopTags(
    artist: string,
    limit = 8,
): Promise<string[]> {
    const config = getApiConfig()
    if (!config) return []
    const trimmed = artist?.trim()
    if (!trimmed) return []

    const cacheKey = `${trimmed.toLowerCase()}::${limit}`
    const cached = ARTIST_TAG_CACHE.get(cacheKey)
    if (cached) {
        return cached
    }

    // Deduplicate concurrent fetches
    const inFlight = ARTIST_TAG_IN_FLIGHT.get(cacheKey)
    if (inFlight) return inFlight

    const promise = (async () => {
        try {
            const response = await fetch(
                `${API_BASE}?method=artist.gettoptags&artist=${encodeURIComponent(trimmed)}&autocorrect=1&format=json&api_key=${config.apiKey}`, // NOSONAR
                { signal: AbortSignal.timeout(15_000) },
            )
            if (!response.ok) return []
            const data = (await response.json()) as {
                error?: number
                message?: string
                toptags?: {
                    tag?: Array<{ name: string; count?: number }>
                }
            }
            if (typeof data.error === 'number') return []
            const tags = (data.toptags?.tag ?? [])
                .slice(0, limit)
                .map((t) => t.name?.toLowerCase().trim())
                .filter((name): name is string => !!name)

            ARTIST_TAG_CACHE.set(cacheKey, tags)

            return tags
        } catch (err) {
            // Surface tag-fetch failures so autoplay tag-based recommendations
            // remain debuggable when Last.fm is rate-limiting or DNS-flaky.
            logAndWarn(err, 'lastfm.getArtistTopTags', { artist: trimmed })
            return []
        }
    })()

    ARTIST_TAG_IN_FLIGHT.set(cacheKey, promise)
    try {
        return await promise
    } finally {
        ARTIST_TAG_IN_FLIGHT.delete(cacheKey)
    }
}

export async function getSimilarTracks(
    artist: string,
    title: string,
    limit = 10,
): Promise<{ artist: string; title: string; match: number }[]> {
    const config = getApiConfig()
    if (!config) return []
    try {
        const response = await fetch(
            `${API_BASE}?method=track.getSimilar&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(title)}&limit=${limit}&autocorrect=1&format=json&api_key=${config.apiKey}`,
            { signal: AbortSignal.timeout(15_000) },
        )
        if (!response.ok) {
            debugLog({
                message: 'lastFmApi: getSimilarTracks HTTP error',
                data: {
                    status: response.status,
                    statusText: response.statusText,
                },
            })
            return []
        }
        const data = (await response.json()) as {
            similartracks?: {
                track?: Array<{
                    name: string
                    artist: { name: string }
                    match: string
                }>
            }
        }
        return (data.similartracks?.track ?? []).map((t) => ({
            artist: t.artist.name,
            title: t.name,
            match: parseFloat(t.match) || 0,
        }))
    } catch (err) {
        logAndWarn(err, 'lastfm.getSimilarTracks', { artist, title })
        return []
    }
}

export async function getTagTopTracks(
    tag: string,
    limit = 30,
): Promise<{ artist: string; title: string }[]> {
    const config = getApiConfig()
    if (!config) return []
    try {
        const response = await fetch(
            `${API_BASE}?method=tag.getTopTracks&tag=${encodeURIComponent(tag)}&limit=${limit}&format=json&api_key=${config.apiKey}`,
            { signal: AbortSignal.timeout(15_000) },
        )
        if (!response.ok) {
            debugLog({
                message: 'lastFmApi: getTagTopTracks HTTP error',
                data: {
                    status: response.status,
                    statusText: response.statusText,
                },
            })
            return []
        }
        const data = (await response.json()) as {
            toptracks?: {
                track?: Array<{
                    name: string
                    artist: { name: string }
                }>
            }
        }
        return (data.toptracks?.track ?? []).map((t) => ({
            artist: t.artist.name,
            title: t.name,
        }))
    } catch (err) {
        logAndWarn(err, 'lastfm.getTagTopTracks', { tag })
        return []
    }
}

export async function getLovedTracks(
    username: string,
    limit = 50,
): Promise<{ artist: string; title: string }[]> {
    const config = getApiConfig()
    if (!config) return []
    try {
        const response = await fetch(
            `${API_BASE}?method=user.getlovedtracks&user=${encodeURIComponent(username)}&limit=${limit}&format=json&api_key=${config.apiKey}`,
            { signal: AbortSignal.timeout(15_000) },
        )
        if (!response.ok) {
            debugLog({
                message: 'lastFmApi: getLovedTracks HTTP error',
                data: {
                    status: response.status,
                    statusText: response.statusText,
                },
            })
            return []
        }
        const data = (await response.json()) as {
            lovedtracks?: {
                track?: Array<{
                    name: string
                    artist: { name: string }
                }>
            }
        }
        return (data.lovedtracks?.track ?? []).map((t) => ({
            artist:
                (t.artist as Record<string, string>)['#text'] ??
                t.artist.name ??
                '',
            title: t.name,
        }))
    } catch (err) {
        logAndWarn(err, 'lastfm.getLovedTracks', { username })
        return []
    }
}
