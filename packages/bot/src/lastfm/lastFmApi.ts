/**
 * Last.fm API client for updateNowPlaying and scrobble.
 * Supports per-user session keys (from DB) and fallback to env LASTFM_SESSION_KEY.
 * See https://www.last.fm/api and https://www.last.fm/api/authspec (Section 8: signing).
 */

import crypto from 'node:crypto'
import { lastFmLinkService } from '@lucky/shared/services'

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
): Promise<string | null> {
    const config = getApiConfig()
    if (!config) return null
    if (discordId) {
        const fromDb = await lastFmLinkService.getSessionKey(discordId)
        if (fromDb) return fromDb
    }
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
    } catch {
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
