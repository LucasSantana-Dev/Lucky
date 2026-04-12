export type SpotifyTokenResponse = {
    accessToken: string
    refreshToken: string
    expiresIn: number
    spotifyId: string
    spotifyUsername: string
}

export async function exchangeCodeForToken(code: string): Promise<SpotifyTokenResponse | null> {
    const clientId = process.env.SPOTIFY_CLIENT_ID
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
    const redirectUri = process.env.SPOTIFY_REDIRECT_URI

    if (!clientId || !clientSecret || !redirectUri) {
        return null
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

    try {
        const res = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code.trim(),
                redirect_uri: redirectUri,
            }).toString(),
        })

        if (!res.ok) {
            return null
        }

        const data = (await res.json().catch(() => null)) as {
            access_token?: string
            refresh_token?: string
            expires_in?: number
            error?: string
        }

        if (data?.error || !data?.access_token || !data?.refresh_token) {
            return null
        }

        const userRes = await fetch('https://api.spotify.com/v1/me', {
            headers: {
                'Authorization': `Bearer ${data.access_token}`,
            },
        })

        if (!userRes.ok) {
            return null
        }

        const userData = (await userRes.json().catch(() => null)) as {
            id?: string
            display_name?: string
            error?: string
        }

        if (userData?.error || !userData?.id) {
            return null
        }

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresIn: data.expires_in ?? 3600,
            spotifyId: userData.id,
            spotifyUsername: userData.display_name ?? userData.id,
        }
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
