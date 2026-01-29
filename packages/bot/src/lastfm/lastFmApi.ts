/**
 * Last.fm API client for updateNowPlaying and scrobble.
 * Supports per-user session keys (from DB) and fallback to env LASTFM_SESSION_KEY.
 * See https://www.last.fm/api and https://www.last.fm/api/authspec (Section 8: signing).
 */

import crypto from 'node:crypto'
import { lastFmLinkService } from '@lukbot/shared/services'

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

export async function getSessionKeyForUser(discordId: string | undefined): Promise<string | null> {
  const config = getApiConfig()
  if (!config) return null
  if (discordId) {
    const fromDb = await lastFmLinkService.getSessionKey(discordId)
    if (fromDb) return fromDb
  }
  const fromEnv = process.env.LASTFM_SESSION_KEY
  return fromEnv ?? null
}

function buildSignature(params: Record<string, string>, secret: string): string {
  const keys = Object.keys(params).filter(
    (k) => k !== 'format' && k !== 'callback',
  ).sort()
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
        throw new Error(`Last.fm ${method}: ${data.error} - ${data.message ?? ''}`)
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
    artist: artist.trim(),
    track: track.trim(),
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
    artist: artist.trim(),
    track: track.trim(),
    timestamp: String(Math.floor(timestamp)),
  }
  if (durationSec != null && durationSec > 0) {
    params.duration = String(Math.round(durationSec))
  }
  await signedPost('track.scrobble', params, sessionKey)
}
