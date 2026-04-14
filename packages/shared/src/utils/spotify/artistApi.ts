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
        const res = await fetch(
            `https://api.spotify.com/v1/artists/${encodeURIComponent(artistId)}/related-artists`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
        )
        if (!res.ok) return []
        const data = (await res.json().catch(() => null)) as {
            artists?: unknown[]
        }
        return (data?.artists ?? [])
            .map((a) =>
                mapSpotifyArtist(a as Parameters<typeof mapSpotifyArtist>[0]),
            )
            .filter((a): a is SpotifyArtist => a !== null)
    } catch {
        return []
    }
}
