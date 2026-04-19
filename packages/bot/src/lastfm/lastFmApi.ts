/**
 * Last.fm API client for updateNowPlaying and scrobble.
 * Supports per-user session keys (from DB) and fallback to env LASTFM_SESSION_KEY.
 * See https://www.last.fm/api and https://www.last.fm/api/authspec (Section 8: signing).
 */

import crypto from 'node:crypto'
import { lastFmLinkService } from '@lucky/shared/services'
import { logAndSwallow } from '@lucky/shared/utils/error'

const API_BASE = 'https://ws.audioscrobbler.com/2.0/'

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
        const res = await fetch(`${API_BASE}?${params.toString()}`)
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
        logAndSwallow(err, 'lastfm.getTopTracks')
        return []
    }
}

export async function updateNowPlaying(
    artist: string,
    track: string,
    durationSec?: number,
    sessionKey?: string | null,
): Promise<void> {
    if (!sessionKey || !getApiConfig()) return
    const params: Record<string, string> = {
        artist: normalizeLastFmArtist(artist),
        track: normalizeLastFmTitle(track),
    }
    if (durationSec != null && durationSec > 0) {
        params.duration = String(Math.round(durationSec))
    }
    await signedPost('track.updateNowPlaying', params, sessionKey)
}

export async function scrobble(
    artist: string,
    track: string,
    timestamp: number,
    durationSec?: number,
    sessionKey?: string | null,
): Promise<void> {
    if (!sessionKey || !getApiConfig()) return
    const params: Record<string, string> = {
        artist: normalizeLastFmArtist(artist),
        track: normalizeLastFmTitle(track),
        timestamp: String(Math.floor(timestamp)),
    }
    if (durationSec != null && durationSec > 0) {
        params.duration = String(Math.round(durationSec))
    }
    await signedPost('track.scrobble', params, sessionKey)
}

export function isLastFmInvalidSessionError(error: unknown): boolean {
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
        )
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
        logAndSwallow(err, 'lastfm.getRecentTracks', { username: lastFmUsername })
        return []
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
        )
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
        logAndSwallow(err, 'lastfm.getSimilarTracks', { artist, title })
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
        )
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
        logAndSwallow(err, 'lastfm.getTagTopTracks', { tag })
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
        )
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
        logAndSwallow(err, 'lastfm.getLovedTracks', { username })
        return []
    }

export async function getArtistTopTracks(
    artist: string,
    limit = 10,
): Promise<{ artist: string; title: string }[]> {
    const config = getApiConfig()
    if (!config) return []
    try {
        const response = await fetch(
            `${API_BASE}?method=artist.getTopTracks&artist=${encodeURIComponent(artist)}&limit=${limit}&format=json&api_key=${config.apiKey}`,
        )
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
        logAndSwallow(err, 'lastfm.getArtistTopTracks', { artist })
        return []
    }
}

}
