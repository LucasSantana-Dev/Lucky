const API_BASE = 'https://api.spotify.com/v1'

export async function getUserTopTracks(
    accessToken: string,
    timeRange: 'short_term' | 'medium_term' | 'long_term' = 'medium_term',
    limit = 50,
): Promise<{ artist: string; title: string }[]> {
    try {
        const response = await fetch(
            `${API_BASE}/me/top/tracks?time_range=${timeRange}&limit=${limit}`,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            },
        )
        if (!response.ok) return []

        const data = (await response.json()) as {
            items?: Array<{
                name: string
                artists: Array<{ name: string }>
            }>
        }

        return (data.items ?? []).map((t) => ({
            artist: t.artists[0]?.name ?? '',
            title: t.name,
        }))
    } catch {
        return []
    }
}

export async function getUserSavedTracks(
    accessToken: string,
    limit = 50,
): Promise<{ artist: string; title: string }[]> {
    try {
        const response = await fetch(
            `${API_BASE}/me/tracks?limit=${limit}`,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            },
        )
        if (!response.ok) return []

        const data = (await response.json()) as {
            items?: Array<{
                track: {
                    name: string
                    artists: Array<{ name: string }>
                }
            }>
        }

        return (data.items ?? []).map((item) => ({
            artist: item.track.artists[0]?.name ?? '',
            title: item.track.name,
        }))
    } catch {
        return []
    }
}
