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

async function fetchSpotifyArtistName(
    accessToken: string,
    artistId: string,
): Promise<string | null> {
    try {
        const res = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (!res.ok) return null
        const data = (await res.json().catch(() => null)) as { name?: string }
        return data?.name ?? null
    } catch {
        return null
    }
}

async function fetchLastFmSimilarArtists(
    artistName: string,
    limit: number,
): Promise<string[]> {
    const apiKey = process.env.LASTFM_API_KEY
    if (!apiKey) return []
    try {
        const params = new URLSearchParams({
            method: 'artist.getSimilar',
            artist: artistName,
            api_key: apiKey,
            format: 'json',
            limit: String(limit),
            autocorrect: '1',
        })
        const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${params.toString()}`)
        if (!res.ok) return []
        const data = (await res.json().catch(() => null)) as {
            similarartists?: { artist?: Array<{ name?: string }> }
        }
        return (data?.similarartists?.artist ?? [])
            .map((a) => a.name)
            .filter((n): n is string => typeof n === 'string' && n.length > 0)
    } catch {
        return []
    }
}

export async function getSpotifyRelatedArtists(
    accessToken: string,
    artistId: string,
    limit = 30,
): Promise<SpotifyArtist[]> {
    // Spotify deprecated /v1/recommendations and /v1/artists/{id}/related-artists
    // for new apps in 2024 (404/403). Use Last.fm artist.getSimilar to find
    // similar artist NAMES, then look each up via Spotify search to get full
    // artist data (image, popularity, genres).
    try {
        const seedName = await fetchSpotifyArtistName(accessToken, artistId)
        if (!seedName) {
            console.warn(`[Spotify] Could not fetch artist name for ${artistId}`)
            return []
        }
        const lastFmLimit = Math.min(limit, 50)
        const similarNames = await fetchLastFmSimilarArtists(seedName, lastFmLimit)
        if (similarNames.length === 0) {
            console.warn(`[Spotify] Last.fm returned no similar artists for "${seedName}"`)
            return []
        }
        const lookupCount = Math.max(limit, 30)
        const lookups = await Promise.all(
            similarNames.slice(0, lookupCount).map((name) =>
                searchSpotifyArtists(accessToken, name, 1).then((r) => r[0] ?? null),
            ),
        )
        const seenIds = new Set<string>()
        const artists: SpotifyArtist[] = []
        for (const a of lookups) {
            if (a && !seenIds.has(a.id)) {
                seenIds.add(a.id)
                artists.push(a)
            }
        }
        return artists
    } catch (error) {
        console.error(`[Spotify] getSpotifyRelatedArtists error for ${artistId}:`, error)
        return []
    }
}
