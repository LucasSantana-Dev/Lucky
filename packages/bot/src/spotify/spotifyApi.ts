export interface SpotifyAudioFeatures {
    energy: number
    valence: number
    danceability: number
    tempo: number
    acousticness: number
}

export async function getAudioFeatures(
    accessToken: string,
    spotifyTrackId: string,
): Promise<SpotifyAudioFeatures | null> {
    try {
        const res = await fetch(
            `https://api.spotify.com/v1/audio-features/${spotifyTrackId}`,
            {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            },
        )

        if (!res.ok) {
            return null
        }

        const data = (await res.json().catch(() => null)) as {
            energy?: number
            valence?: number
            danceability?: number
            tempo?: number
            acousticness?: number
        }

        if (!data?.energy || typeof data.valence !== 'number') {
            return null
        }

        return {
            energy: data.energy,
            valence: data.valence,
            danceability: data.danceability ?? 0,
            tempo: data.tempo ?? 0,
            acousticness: data.acousticness ?? 0,
        }
    } catch {
        return null
    }
}

export async function searchSpotifyTrack(
    accessToken: string,
    title: string,
    artist: string,
): Promise<string | null> {
    try {
        const query = `track:"${title}" artist:"${artist}"`
        const params = new URLSearchParams({
            q: query,
            type: 'track',
            limit: '1',
        })

        const res = await fetch(
            `https://api.spotify.com/v1/search?${params.toString()}`,
            {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            },
        )

        if (!res.ok) {
            return null
        }

        const data = (await res.json().catch(() => null)) as {
            tracks?: { items?: Array<{ id?: string }> }
        }

        return data?.tracks?.items?.[0]?.id ?? null
    } catch {
        return null
    }
}
