import { errorLog } from '../general/log'

let cachedClientToken: { token: string; expiresAt: number } | null = null

/**
 * Client-credentials access token for Spotify's Web API, cached until 30s
 * before expiry. Returns null when credentials are unset or the request
 * fails, so callers degrade instead of throwing.
 *
 * Lives in shared because both the backend (artist suggestions) and the bot
 * (`/album` album resolution) need it; a second copy would drift on the
 * caching and expiry-margin details.
 */
export async function getSpotifyClientToken(): Promise<string | null> {
    if (cachedClientToken && Date.now() < cachedClientToken.expiresAt) {
        return cachedClientToken.token
    }
    const clientId = process.env.SPOTIFY_CLIENT_ID
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
    if (!clientId || !clientSecret) return null

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    try {
        const res = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                Authorization: `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: 'grant_type=client_credentials',
            signal: AbortSignal.timeout(10_000),
        })
        if (!res.ok) return null
        const data = (await res.json().catch(() => null)) as {
            access_token?: string
            expires_in?: number
        } | null
        if (!data?.access_token) return null
        cachedClientToken = {
            token: data.access_token,
            expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 - 30_000,
        }
        return cachedClientToken.token
    } catch (error) {
        errorLog({
            message: 'Spotify client-credentials token request failed',
            error,
        })
        return null
    }
}

/** Test seam: drop the cached token so a fresh request is made. */
export function resetSpotifyClientTokenCache(): void {
    cachedClientToken = null
}
