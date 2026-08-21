import { getSpotifyClientToken } from './clientToken'

export interface SpotifyAlbumMatch {
    id: string
    name: string
    artist: string
    url: string
}

function mapSpotifyAlbum(raw: {
    id?: string
    name?: string
    artists?: { name?: string }[]
    external_urls?: { spotify?: string }
}): SpotifyAlbumMatch | null {
    if (!raw.id || !raw.name) return null
    const url = raw.external_urls?.spotify
    if (!url) return null
    return {
        id: raw.id,
        name: raw.name,
        artist: raw.artists?.[0]?.name ?? 'Unknown Artist',
        url,
    }
}

/**
 * Resolve a free-text album query to Spotify album URLs.
 *
 * `/album` needs this because no discord-player search QueryType can return a
 * playlist: SPOTIFY_SEARCH (and Apple Music search) hit the track-search API
 * and build their response with `createResponse(null, tracks)`, so the
 * extractor's album branch is only reachable via an album URL. Resolving the
 * URL here lets the command reuse the URL path that already works.
 */
export async function searchSpotifyAlbums(
    query: string,
    limit = 5,
): Promise<SpotifyAlbumMatch[]> {
    if (!query.trim()) return []

    const accessToken = await getSpotifyClientToken()
    if (!accessToken) return []

    try {
        const params = new URLSearchParams({
            q: query,
            type: 'album',
            limit: String(Math.min(Math.max(limit, 1), 50)),
        })
        const res = await fetch(
            `https://api.spotify.com/v1/search?${params.toString()}`,
            {
                headers: { Authorization: `Bearer ${accessToken}` },
                signal: AbortSignal.timeout(10_000),
            },
        )
        if (!res.ok) return []
        const data = (await res.json().catch(() => null)) as {
            albums?: { items?: unknown[] }
        } | null
        return (data?.albums?.items ?? [])
            .map((a) =>
                mapSpotifyAlbum(a as Parameters<typeof mapSpotifyAlbum>[0]),
            )
            .filter((a): a is SpotifyAlbumMatch => a !== null)
    } catch {
        return []
    }
}
