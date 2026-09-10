import { errorLog, warnLog } from '../general/log'
import {
    sanitizeErrorMessage,
    sanitizeLogInput,
} from '../general/errorSanitizer'
import { mapSpotifyAlbum, type SpotifyAlbumMatch } from './albumApi'

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

/**
 * One GET against Spotify's `/v1/search`, shared by the artist and track
 * searches: same endpoint, same auth, same deadline, same "an error is an
 * empty result" convention. `pick` pulls the item list out of the response
 * for the requested `type`, since Spotify nests it under a key named after
 * that type. Returns [] on a non-ok response, a timeout, or unparseable JSON.
 */
async function searchSpotify(
    accessToken: string,
    query: string,
    type: 'artist' | 'track',
    limit: number,
    pick: (data: Record<string, unknown> | null) => unknown[],
): Promise<unknown[]> {
    if (!query.trim()) return []
    try {
        const params = new URLSearchParams({
            q: query,
            type,
            limit: String(Math.min(Math.max(limit, 1), 50)),
        })
        const res = await fetch(
            `https://api.spotify.com/v1/search?${params.toString()}`,
            {
                headers: { Authorization: `Bearer ${accessToken}` },
                // Matches the other Spotify requests in this file. Without it
                // a stalled search has no upper bound, and a deferred command
                // reply waiting on it can miss Discord's own deadline.
                signal: AbortSignal.timeout(10_000),
            },
        )
        if (!res.ok) return []
        const data = (await res.json().catch(() => null)) as Record<
            string,
            unknown
        > | null
        return pick(data)
    } catch {
        return []
    }
}

export async function searchSpotifyArtists(
    accessToken: string,
    query: string,
    limit = 12,
): Promise<SpotifyArtist[]> {
    const items = await searchSpotify(
        accessToken,
        query,
        'artist',
        limit,
        (data) =>
            (data?.artists as { items?: unknown[] } | undefined)?.items ?? [],
    )
    return items
        .map((a) =>
            mapSpotifyArtist(a as Parameters<typeof mapSpotifyArtist>[0]),
        )
        .filter((a): a is SpotifyArtist => a !== null)
}

async function fetchSpotifyArtistName(
    accessToken: string,
    artistId: string,
): Promise<string | null> {
    try {
        const res = await fetch(
            `https://api.spotify.com/v1/artists/${encodeURIComponent(artistId)}`,
            {
                headers: { Authorization: `Bearer ${accessToken}` },
            },
        )
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
        const res = await fetch(
            `https://ws.audioscrobbler.com/2.0/?${params.toString()}`,
            { signal: AbortSignal.timeout(15_000) },
        )
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
            warnLog({
                message: '[Spotify] could not fetch artist name',
                data: { artistId: sanitizeLogInput(artistId) },
            })
            return []
        }
        const lastFmLimit = Math.min(limit, 50)
        const similarNames = await fetchLastFmSimilarArtists(
            seedName,
            lastFmLimit,
        )
        if (similarNames.length === 0) {
            warnLog({
                message: '[Spotify] Last.fm returned no similar artists',
                data: { seedName: sanitizeLogInput(seedName) },
            })
            return []
        }
        const lookupCount = Math.max(limit, 30)
        const lookups = await Promise.all(
            similarNames
                .slice(0, lookupCount)
                .map((name) =>
                    searchSpotifyArtists(accessToken, name, 1).then(
                        (r) => r[0] ?? null,
                    ),
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
        errorLog({
            message: `[Spotify] getSpotifyRelatedArtists error: ${sanitizeErrorMessage(error)}`,
            data: { artistId: sanitizeLogInput(artistId) },
        })
        return []
    }
}

export interface SpotifyTrackRef {
    name: string
    artist: string
    url: string
}

function mapSpotifyTrackRef(raw: {
    name?: string
    artists?: { name?: string }[]
    external_urls?: { spotify?: string }
}): SpotifyTrackRef | null {
    const url = raw.external_urls?.spotify
    if (!raw.name || !url) return null
    return {
        name: raw.name,
        artist: raw.artists?.[0]?.name ?? 'Unknown Artist',
        url,
    }
}

/**
 * Direct Spotify Web API track search. `/artist`'s plain (non-discography)
 * flow normally resolves its Spotify arm through discord-player-spotify's
 * `SpotifyAPI.search()`, which hardcodes `limit=10` in both of its request
 * branches with no way to pass a higher value through (#2304). This hits
 * the same `/v1/search` endpoint directly so a real limit (Spotify's own
 * max is 50) reaches the request, for the narrow case where the capped
 * result is short of what was asked for.
 */
export async function searchSpotifyTracks(
    accessToken: string,
    query: string,
    limit = 10,
): Promise<SpotifyTrackRef[]> {
    const items = await searchSpotify(
        accessToken,
        query,
        'track',
        limit,
        (data) =>
            (data?.tracks as { items?: unknown[] } | undefined)?.items ?? [],
    )
    return items
        .map((t) =>
            mapSpotifyTrackRef(t as Parameters<typeof mapSpotifyTrackRef>[0]),
        )
        .filter((t): t is SpotifyTrackRef => t !== null)
}

/**
 * Spotify's own top-tracks ranking (already most-popular-first) — the
 * accurate "most famous" ordering `/artist`'s discography mode needs, unlike
 * the generic track-search endpoint the plain flow uses.
 */
export async function getSpotifyArtistTopTracks(
    accessToken: string,
    artistId: string,
): Promise<SpotifyTrackRef[]> {
    try {
        const res = await fetch(
            `https://api.spotify.com/v1/artists/${encodeURIComponent(artistId)}/top-tracks?market=US`,
            {
                headers: { Authorization: `Bearer ${accessToken}` },
                signal: AbortSignal.timeout(10_000),
            },
        )
        if (!res.ok) return []
        const data = (await res.json().catch(() => null)) as {
            tracks?: unknown[]
        } | null
        return (data?.tracks ?? [])
            .map((t) =>
                mapSpotifyTrackRef(
                    t as Parameters<typeof mapSpotifyTrackRef>[0],
                ),
            )
            .filter((t): t is SpotifyTrackRef => t !== null)
    } catch (error) {
        errorLog({
            message: `[Spotify] getSpotifyArtistTopTracks error: ${sanitizeErrorMessage(error)}`,
            data: { artistId: sanitizeLogInput(artistId) },
        })
        return []
    }
}

/**
 * Studio albums + singles for an artist, newest release first, deduped by
 * album name (deluxe/remaster reissues share a name with the original and
 * would otherwise double-queue the same tracks). Capped at `maxAlbums` —
 * a prolific artist's catalog can run into the hundreds of releases, and
 * each one costs a discord-player search call downstream to resolve tracks,
 * so an unbounded fetch here would make discography mode slow and heavy.
 */
export async function getSpotifyArtistAlbums(
    accessToken: string,
    artistId: string,
    maxAlbums = 25,
): Promise<SpotifyAlbumMatch[]> {
    type RawAlbum = {
        id?: string
        name?: string
        release_date?: string
        artists?: { name?: string }[]
        external_urls?: { spotify?: string }
    }
    const seenNames = new Set<string>()
    const deduped: RawAlbum[] = []
    let url: string | null =
        `https://api.spotify.com/v1/artists/${encodeURIComponent(artistId)}/albums?include_groups=album,single&market=US&limit=50`
    try {
        // Spotify caps each page at 50; stop once we have enough distinct
        // albums, or the artist runs out of pages. Deduping inside the loop
        // (rather than after) means duplicate-heavy pages (reissues/deluxe
        // editions sharing a name) don't cut the fetch short before enough
        // distinct albums have actually been found.
        while (url && deduped.length < maxAlbums) {
            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
                signal: AbortSignal.timeout(10_000),
            })
            if (!res.ok) break
            const data = (await res.json().catch(() => null)) as {
                items?: RawAlbum[]
                next?: string | null
            } | null
            if (!data) break
            for (const album of data.items ?? []) {
                const key = album.name?.toLowerCase().trim()
                if (!key || seenNames.has(key)) continue
                seenNames.add(key)
                deduped.push(album)
            }
            url = data.next ?? null
        }
    } catch (error) {
        errorLog({
            message: `[Spotify] getSpotifyArtistAlbums error: ${sanitizeErrorMessage(error)}`,
            data: { artistId: sanitizeLogInput(artistId) },
        })
        // Fall through with whatever pages were fetched before the failure.
    }

    deduped.sort((a, b) =>
        (b.release_date ?? '').localeCompare(a.release_date ?? ''),
    )

    return deduped
        .slice(0, maxAlbums)
        .map((a) => mapSpotifyAlbum(a))
        .filter((a): a is SpotifyAlbumMatch => a !== null)
}
