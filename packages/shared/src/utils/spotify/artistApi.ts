export interface SpotifyArtist {
    id: string
    name: string
    imageUrl: string | null
    popularity: number
    genres: string[]
}

function mapSpotifyArtist(raw: {
    id?: string
    name?: string
    images?: { url: string }[]
    popularity?: number
    genres?: string[]
}): SpotifyArtist | null {
    if (!raw.id || !raw.name) return null
    return {
        id: raw.id,
        name: raw.name,
        imageUrl: raw.images?.[0]?.url ?? null,
        popularity: raw.popularity ?? 0,
        genres: raw.genres ?? [],
    }
}

export async function searchSpotifyArtists(
    accessToken: string,
    query: string,
    limit = 12,
): Promise<SpotifyArtist[]> {
    if (!query.trim()) return []
    try {
        const params = new URLSearchParams({
            q: query,
            type: 'artist',
            limit: String(Math.min(limit, 50)),
        })
        const res = await fetch(
            `https://api.spotify.com/v1/search?${params.toString()}`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
        )
        if (!res.ok) return []
        const data = (await res.json().catch(() => null)) as {
            artists?: { items?: unknown[] }
        }
        return (data?.artists?.items ?? [])
            .map((a) =>
                mapSpotifyArtist(a as Parameters<typeof mapSpotifyArtist>[0]),
            )
            .filter((a): a is SpotifyArtist => a !== null)
    } catch {
        return []
    }
}

export async function getSpotifyRelatedArtists(
    accessToken: string,
    artistId: string,
): Promise<SpotifyArtist[]> {
    try {
        const params = new URLSearchParams({
            seed_artists: artistId,
            limit: '20',
        })
        const res = await fetch(
            `https://api.spotify.com/v1/recommendations?${params.toString()}`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
        )
        if (!res.ok) {
            console.warn(`[Spotify] recommendations API returned ${res.status} for artist ${artistId}`)
            return []
        }
        const data = (await res.json().catch(() => null)) as {
            tracks?: Array<{ artists?: unknown[] }>
        }
        const seenIds = new Set<string>()
        const artists: SpotifyArtist[] = []
        for (const track of data?.tracks ?? []) {
            if (artists.length >= 12) break
            for (const artist of track.artists ?? []) {
                if (artists.length >= 12) break
                const mapped = mapSpotifyArtist(
                    artist as Parameters<typeof mapSpotifyArtist>[0],
                )
                if (mapped && !seenIds.has(mapped.id)) {
                    seenIds.add(mapped.id)
                    artists.push(mapped)
                }
            }
        }
        if (artists.length === 0) {
            console.warn(`[Spotify] getSpotifyRelatedArtists returned empty array for artist ${artistId}. Tracks count: ${data?.tracks?.length ?? 0}`)
        }
        return artists
    } catch (error) {
        console.error(`[Spotify] getSpotifyRelatedArtists error for artist ${artistId}:`, error)
        return []
    }
}
