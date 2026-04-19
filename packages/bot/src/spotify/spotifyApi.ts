import { logAndSwallow } from '@lucky/shared/utils/error'
import { debugLog } from '@lucky/shared/utils/general/log'

import { LRUCache } from 'lru-cache'

interface PopularityEntry {
    value: number | null
}

interface GenresEntry {
    value: string[] | null
}

const artistPopularityCache = new LRUCache<string, PopularityEntry>({
    max: 5000,
    ttl: 24 * 60 * 60 * 1000,
})

const artistGenresCache = new LRUCache<string, GenresEntry>({
    max: 5000,
    ttl: 24 * 60 * 60 * 1000,
})

export async function getArtistPopularity(
    accessToken: string,
    artistName: string,
): Promise<number | null> {
    const cached = artistPopularityCache.get(artistName)
    if (cached !== undefined) {
        debugLog({
            message: 'Artist popularity cache hit',
            data: { artistName, hasValue: cached.value !== null },
        })
        return cached.value
    }

    debugLog({
        message: 'Artist popularity cache miss',
        data: { artistName, cacheSize: artistPopularityCache.size },
    })

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
            artistPopularityCache.set(artistName, { value: null })
            return null
        }

        const data = (await res.json().catch(() => null)) as {
            artists?: { items?: Array<{ popularity?: number }> }
        }

        const popularity = data?.artists?.items?.[0]?.popularity ?? null
        artistPopularityCache.set(artistName, { value: popularity })
        return popularity
    } catch {
        artistPopularityCache.set(artistName, { value: null })
        return null
    }
}

export async function getArtistGenres(
    accessToken: string,
    artistName: string,
): Promise<string[]> {
    const cached = artistGenresCache.get(artistName)
    if (cached !== undefined) {
        debugLog({
            message: 'Artist genres cache hit',
            data: { artistName, genreCount: cached.value?.length ?? 0 },
        })
        return cached.value ?? []
    }

    debugLog({
        message: 'Artist genres cache miss',
        data: { artistName, cacheSize: artistGenresCache.size },
    })

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
            artistGenresCache.set(artistName, { value: null })
            return []
        }

        const data = (await res.json().catch(() => null)) as {
            artists?: { items?: Array<{ genres?: string[] }> }
        }

        const genres = data?.artists?.items?.[0]?.genres ?? []
        artistGenresCache.set(artistName, { value: genres })
        return genres
    } catch {
        artistGenresCache.set(artistName, { value: null })
        return []
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

export interface SpotifyTopArtist {
    id: string
    name: string
    genres: string[]
}

export interface SpotifyTopTrack {
    id: string
    name: string
    artist: string
}

export async function getUserTopArtistsAndTracks(
    accessToken: string,
): Promise<{ artists: SpotifyTopArtist[]; tracks: SpotifyTopTrack[] } | null> {
    try {
        const topArtistsRes = await fetch(
            'https://api.spotify.com/v1/me/top/artists?limit=20&time_range=medium_term',
            {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            },
        )

        const topTracksRes = await fetch(
            'https://api.spotify.com/v1/me/top/tracks?limit=20&time_range=medium_term',
            {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            },
        )

        if (!topArtistsRes.ok || !topTracksRes.ok) {
            return null
        }

        const artistsData = (await topArtistsRes.json().catch(() => null)) as {
            items?: Array<{ id?: string; name?: string; genres?: string[] }>
        }
        const tracksData = (await topTracksRes.json().catch(() => null)) as {
            items?: Array<{ id?: string; name?: string; artists?: Array<{ name?: string }> }>
        }

        if (!artistsData?.items || !tracksData?.items) {
            return null
        }

        const artists: SpotifyTopArtist[] = (artistsData.items ?? [])
            .filter((a) => a.id && a.name)
            .map((a) => ({
                id: a.id!,
                name: a.name!,
                genres: a.genres ?? [],
            }))

        const tracks: SpotifyTopTrack[] = (tracksData.items ?? [])
            .filter((t) => t.id && t.name)
            .map((t) => ({
                id: t.id!,
                name: t.name!,
                artist: t.artists?.[0]?.name ?? 'Unknown',
            }))

        return { artists, tracks }
    } catch (err) {
        logAndSwallow(err, 'spotify.getUserTopArtistsAndTracks')
        return null
    }
}
