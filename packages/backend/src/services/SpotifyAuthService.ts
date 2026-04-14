export type SpotifyTokenResponse = {
    accessToken: string
    refreshToken: string
    expiresIn: number
    spotifyId: string
    spotifyUsername: string
}

async function fetchJson<T>(
    url: string,
    init: Parameters<typeof fetch>[1],
): Promise<T | null> {
    const res = await fetch(url, init)
    if (!res.ok) return null
    return res.json().catch(() => null) as Promise<T | null>
}

export async function exchangeCodeForToken(
    code: string,
): Promise<SpotifyTokenResponse | null> {
    const clientId = process.env.SPOTIFY_CLIENT_ID
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
    const redirectUri = process.env.SPOTIFY_REDIRECT_URI

    if (!clientId || !clientSecret || !redirectUri) return null

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

    try {
        const tokenData = await fetchJson<{
            access_token?: string
            refresh_token?: string
            expires_in?: number
            error?: string
        }>('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                Authorization: `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code.trim(),
                redirect_uri: redirectUri,
            }).toString(),
        })

        if (
            !tokenData ||
            tokenData.error ||
            !tokenData.access_token ||
            !tokenData.refresh_token
        ) {
            return null
        }

        const userData = await fetchJson<{
            id?: string
            display_name?: string
            error?: string
        }>('https://api.spotify.com/v1/me', {
            headers: {
                Authorization: `Bearer ${tokenData.access_token}`,
            },
        })

        if (!userData || userData.error || !userData.id) {
            return null
        }

        return {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresIn: tokenData.expires_in ?? 3600,
            spotifyId: userData.id,
            spotifyUsername: userData.display_name ?? userData.id,
        }
    } catch {
        return null
    }
}

let cachedClientToken: { token: string; expiresAt: number } | null = null

export async function getSpotifyClientToken(): Promise<string | null> {
    if (cachedClientToken && Date.now() < cachedClientToken.expiresAt) {
        return cachedClientToken.token
    }
    const clientId = process.env.SPOTIFY_CLIENT_ID
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
    if (!clientId || !clientSecret) return null

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    try {
        const data = await fetchJson<{
            access_token?: string
            expires_in?: number
        }>('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                Authorization: `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: 'grant_type=client_credentials',
        })
        if (!data?.access_token) return null
        cachedClientToken = {
            token: data.access_token,
            expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 - 30_000,
        }
        return cachedClientToken.token
    } catch {
        return null
    }
}

export function isSpotifyAuthConfigured(): boolean {
    return !!(
        process.env.SPOTIFY_CLIENT_ID &&
        process.env.SPOTIFY_CLIENT_SECRET &&
        process.env.SPOTIFY_REDIRECT_URI
    )
}
