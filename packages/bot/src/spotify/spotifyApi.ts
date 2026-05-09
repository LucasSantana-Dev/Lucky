import { logAndSwallow } from '@lucky/shared/utils/error'
import { debugLog, warnLog } from '@lucky/shared/utils/general/log'

export interface SpotifyRecommendationTrack {
    id: string
    name: string
    artists: { name: string }[]
    duration_ms: number
}

export type SpotifyAudioFeatureConstraints = {
    energy?: number
    valence?: number
    danceability?: number
}

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

async function withSpotifyRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn()
        } catch (error) {
            const isResponse = error instanceof Response
            const status = isResponse ? error.status : null

            if (status === 429) {
                const retryAfterHeader = isResponse
                    ? error.headers.get('Retry-After')
                    : null
                const retryAfterSeconds = retryAfterHeader
                    ? parseInt(retryAfterHeader, 10)
                    : 1
                const delayMs = retryAfterSeconds * 1000

                if (attempt < maxRetries) {
                    debugLog({
                        message: 'Spotify 429 rate limit, retrying',
                        data: {
                            attempt,
                            maxRetries,
                            delayMs,
                            retryAfter: retryAfterSeconds,
                        },
                    })
                    await sleep(delayMs)
                    continue
                } else {
                    warnLog({
                        message: 'Spotify 429 retry exhausted',
                        data: {
                            attempt,
                            maxRetries,
                        },
                    })
                    throw error
                }
            }

            throw error
        }
    }
}

export async function getSpotifyRecommendations(
    accessToken: string,
    seedTrackIds: string[],
    limit = 10,
    audioConstraints?: SpotifyAudioFeatureConstraints,
): Promise<SpotifyRecommendationTrack[]> {
    if (seedTrackIds.length === 0) return []
    try {
        const result = await withSpotifyRetry(async () => {
            const params = new URLSearchParams({
                seed_tracks: seedTrackIds.slice(0, 5).join(','),
                limit: String(Math.min(limit, 100)),
            })

            if (audioConstraints) {
                const TOLERANCE = 0.25
                if (audioConstraints.energy !== undefined) {
                    params.set(
                        'min_energy',
                        String(
                            Math.max(
                                0,
                                audioConstraints.energy - TOLERANCE,
                            ).toFixed(2),
                        ),
                    )
                    params.set(
                        'max_energy',
                        String(
                            Math.min(
                                1,
                                audioConstraints.energy + TOLERANCE,
                            ).toFixed(2),
                        ),
                    )
                }
                if (audioConstraints.valence !== undefined) {
                    params.set(
                        'min_valence',
                        String(
                            Math.max(
                                0,
                                audioConstraints.valence - TOLERANCE,
                            ).toFixed(2),
                        ),
                    )
                    params.set(
                        'max_valence',
                        String(
                            Math.min(
                                1,
                                audioConstraints.valence + TOLERANCE,
                            ).toFixed(2),
                        ),
                    )
                }
                if (audioConstraints.danceability !== undefined) {
                    params.set(
                        'min_danceability',
                        String(
                            Math.max(
                                0,
                                audioConstraints.danceability - TOLERANCE,
                            ).toFixed(2),
                        ),
                    )
                    params.set(
                        'max_danceability',
                        String(
                            Math.min(
                                1,
                                audioConstraints.danceability + TOLERANCE,
                            ).toFixed(2),
                        ),
                    )
                }
            }
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
        })
        return result
    } catch (err) {
        logAndSwallow(err, 'spotify.getRecommendations', { seedTrackIds: seedTrackIds.length })
        return []
    }
}

import { LRUCache } from 'lru-cache'

export interface SpotifyAudioFeatures {
    energy: number
    valence: number
    danceability: number
    tempo: number
    acousticness: number
}

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

export async function getAudioFeatures(
    accessToken: string,
    spotifyTrackId: string,
): Promise<SpotifyAudioFeatures | null> {
    try {
        const data = await withSpotifyRetry(async () => {
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

            return (await res.json().catch(() => null)) as {
                energy?: number
                valence?: number
                danceability?: number
                tempo?: number
                acousticness?: number
            }
        })

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
    } catch (err) {
        logAndSwallow(err, 'spotify.getAudioFeatures', { spotifyTrackId })
        return null
    }
}

export async function getBatchAudioFeatures(
    accessToken: string,
    spotifyIds: string[],
): Promise<Map<string, SpotifyAudioFeatures>> {
    if (spotifyIds.length === 0) return new Map()

    try {
        const result = await withSpotifyRetry(async () => {
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

            if (!res.ok) return null

            return (await res.json().catch(() => null)) as {
                audio_features?: Array<{
                    id?: string
                    energy?: number
                    valence?: number
                    danceability?: number
                    tempo?: number
                    acousticness?: number
                } | null>
            }
        })

        const resultMap = new Map<string, SpotifyAudioFeatures>()
        if (!result?.audio_features) return resultMap

        for (const feature of result.audio_features) {
            if (
                !feature?.id ||
                typeof feature.energy !== 'number' ||
                typeof feature.valence !== 'number'
            ) {
                continue
            }

            resultMap.set(feature.id, {
                energy: feature.energy,
                valence: feature.valence,
                danceability: feature.danceability ?? 0,
                tempo: feature.tempo ?? 0,
                acousticness: feature.acousticness ?? 0,
            })
        }

        return resultMap
    } catch (err) {
        logAndSwallow(err, 'spotify.getBatchAudioFeatures', { count: spotifyIds.length })
        return new Map()
    }
}

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
        const popularity = await withSpotifyRetry(async () => {
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
                return null
            }

            const data = (await res.json().catch(() => null)) as {
                artists?: { items?: Array<{ popularity?: number }> }
            }

            return data?.artists?.items?.[0]?.popularity ?? null
        })

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
        const genres = await withSpotifyRetry(async () => {
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
                return []
            }

            const data = (await res.json().catch(() => null)) as {
                artists?: { items?: Array<{ genres?: string[] }> }
            }

            return data?.artists?.items?.[0]?.genres ?? []
        })

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

export async function getUserSavedTracks(
    accessToken: string,
    limit = 200,
): Promise<string[]> {
    const savedTrackIds: string[] = []
    const pageLimit = 50
    const maxTracks = Math.min(limit, 200)
    let offset = 0

    try {
        while (offset < maxTracks) {
            const params = new URLSearchParams({
                limit: String(pageLimit),
                offset: String(offset),
            })
            const res = await fetch(
                `https://api.spotify.com/v1/me/tracks?${params.toString()}`,
                {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                },
            )

            if (!res.ok) {
                logAndSwallow(
                    new Error(`HTTP ${res.status}`),
                    'spotify.getUserSavedTracks.request',
                    { status: res.status, offset },
                )
                await res.body?.cancel().catch(() => undefined)
                break
            }

            type SavedTracksPage = { items: Array<{ track?: { id?: string } }>; total?: number }
            let data: SavedTracksPage | null = null
            try {
                data = (await res.json()) as SavedTracksPage
            } catch (parseErr) {
                logAndSwallow(parseErr, 'spotify.getUserSavedTracks.parse', { offset })
                break
            }

            if (!data?.items) {
                break
            }

            for (const item of data.items) {
                if (item.track?.id) {
                    savedTrackIds.push(item.track.id)
                }
            }

            const allFetched = data.total !== undefined && savedTrackIds.length >= data.total
            if (savedTrackIds.length >= maxTracks || !data.items.length || allFetched) {
                break
            }

            offset += pageLimit
        }

        return savedTrackIds.slice(0, maxTracks)
    } catch (err) {
        logAndSwallow(err, 'spotify.getUserSavedTracks')
        return []
    }
}
