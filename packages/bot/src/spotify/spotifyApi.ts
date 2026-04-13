export interface SpotifyRecommendationTrack {
    id: string
    name: string
    artists: { name: string }[]
    duration_ms: number
}

export async function getSpotifyRecommendations(
    accessToken: string,
    seedTrackIds: string[],
    limit = 10,
): Promise<SpotifyRecommendationTrack[]> {
    if (seedTrackIds.length === 0) return []
    try {
        const params = new URLSearchParams({
            seed_tracks: seedTrackIds.slice(0, 5).join(','),
            limit: String(Math.min(limit, 100)),
        })
        const res = await fetch(
            `https://api.spotify.com/v1/recommendations?${params.toString()}`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
        )
        if (!res.ok) return []
        const data = (await res.json().catch(() => null)) as {
            tracks?: Array<{
                id?: string
                name?: string
                artists?: Array<{ name?: string }>
                duration_ms?: number
            }>
        }
        return (data?.tracks ?? [])
            .filter((t) => t.id && t.name)
            .map((t) => ({
                id: t.id!,
                name: t.name!,
                artists: (t.artists ?? []).map((a) => ({ name: a.name ?? '' })),
                duration_ms: t.duration_ms ?? 0,
            }))
    } catch {
        return []
    }
}

export interface SpotifyAudioFeatures {
    energy: number
    valence: number
    danceability: number
    tempo: number
    acousticness: number
}

const artistPopularityCache = new Map<string, number | null>()

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

export async function getBatchAudioFeatures(
    accessToken: string,
    spotifyIds: string[],
): Promise<Map<string, SpotifyAudioFeatures>> {
    if (spotifyIds.length === 0) return new Map()

    try {
        const ids = spotifyIds.slice(0, 100).join(',')
        const res = await fetch(
            `https://api.spotify.com/v1/audio-features?ids=${ids}`,
            {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            },
        )

        if (!res.ok) return new Map()

        const data = (await res.json().catch(() => null)) as {
            audio_features?: Array<{
                id?: string
                energy?: number
                valence?: number
                danceability?: number
                tempo?: number
                acousticness?: number
            } | null>
        }

        const result = new Map<string, SpotifyAudioFeatures>()
        if (!data?.audio_features) return result

        for (const feature of data.audio_features) {
            if (
                !feature?.id ||
                typeof feature.energy !== 'number' ||
                typeof feature.valence !== 'number'
            ) {
                continue
            }

            result.set(feature.id, {
                energy: feature.energy,
                valence: feature.valence,
                danceability: feature.danceability ?? 0,
                tempo: feature.tempo ?? 0,
                acousticness: feature.acousticness ?? 0,
            })
        }

        return result
    } catch {
        return new Map()
    }
}

export async function getArtistPopularity(
    accessToken: string,
    artistName: string,
): Promise<number | null> {
    const cached = artistPopularityCache.get(artistName)
    if (cached !== undefined) return cached

    try {
        const params = new URLSearchParams({
            q: artistName,
            type: 'artist',
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
            artistPopularityCache.set(artistName, null)
            return null
        }

        const data = (await res.json().catch(() => null)) as {
            artists?: { items?: Array<{ popularity?: number }> }
        }

        const popularity = data?.artists?.items?.[0]?.popularity ?? null
        artistPopularityCache.set(artistName, popularity)
        return popularity
    } catch {
        artistPopularityCache.set(artistName, null)
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
