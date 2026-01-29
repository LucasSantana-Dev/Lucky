import crypto from 'node:crypto'

const API_BASE = 'https://ws.audioscrobbler.com/2.0/'

function getApiConfig(): { apiKey: string; secret: string } | null {
  const apiKey = process.env.LASTFM_API_KEY
  const secret = process.env.LASTFM_API_SECRET
  if (!apiKey || !secret) return null
  return { apiKey, secret }
}

function buildSignature(params: Record<string, string>, secret: string): string {
  const keys = Object.keys(params).filter((k) => k !== 'format' && k !== 'callback').sort()
  const str = keys.map((k) => `${k}${params[k]}`).join('') + secret
  return crypto.createHash('md5').update(str, 'utf8').digest('hex')
}

export type LastFmSessionResult = { sessionKey: string; username: string }

export async function exchangeTokenForSession(token: string): Promise<LastFmSessionResult | null> {
  const config = getApiConfig()
  if (!config) return null
  const { apiKey, secret } = config
  const params: Record<string, string> = {
    method: 'auth.getSession',
    api_key: apiKey,
    token: token.trim(),
  }
  params.api_sig = buildSignature(params, secret)
  params.format = 'json'
  const body = new URLSearchParams(params).toString()
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) return null
  const data = (await res.json().catch(() => null)) as {
    session?: { key?: string; name?: string }
    error?: number
  }
  if (data?.error || !data?.session?.key) return null
  return {
    sessionKey: data.session.key,
    username: data.session.name ?? '',
  }
}

export function isLastFmAuthConfigured(): boolean {
  return getApiConfig() !== null
}
