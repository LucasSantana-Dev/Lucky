import type { Express, Response } from 'express'
import { z } from 'zod'
import {
    errorLog,
    getPrismaClient,
    searchSpotifyArtists,
    getSpotifyRelatedArtists,
    type SpotifyArtist,
} from '@lucky/shared/utils'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { apiLimiter, writeLimiter } from '../middleware/rateLimit'
import {
    getSpotifyClientToken,
    isSpotifyAuthConfigured,
} from '../services/SpotifyAuthService'
import { spotifyLinkService, redisClient } from '@lucky/shared/services'

const MAX_SUGGESTIONS = 150
const FALLBACK_SUGGESTIONS_CACHE_KEY = 'artist:suggestions:fallback:v2'
const FALLBACK_SUGGESTIONS_TTL_SECONDS = 60 * 60 // 1 hour
const USER_TOP_ARTISTS_CACHE_PREFIX = 'artist:user:top:v1:'
const USER_TOP_ARTISTS_TTL_SECONDS = 15 * 60 // 15 minutes

const saveArtistBody = z.object({
    guildId: z.string().min(1),
    artistKey: z.string().min(1),
    artistName: z.string().min(1),
    spotifyId: z.string().optional(),
    imageUrl: z.string().optional(),
    preference: z.enum(['prefer', 'block']).default('prefer'),
})

const saveArtistBatchBody = z.object({
    guildId: z.string().min(1),
    items: z.array(
        z.object({
            artistId: z.string().min(1),
            artistKey: z.string().min(1),
            artistName: z.string().min(1),
            imageUrl: z.string().nullable(),
            preference: z.enum(['prefer', 'block']),
        }),
    ),
})

function normalizeArtistKey(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function setupArtistsRoutes(app: Express): void {
    app.get(
        '/api/artists/suggestions',
        apiLimiter,
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const discordUserId = req.user?.id
                if (!discordUserId) {
                    res.status(401).json({ error: 'Not authenticated' })
                    return
                }
                if (!isSpotifyAuthConfigured()) {
                    res.status(503).json({ error: 'Spotify not configured' })
                    return
                }
                const clientToken = await getSpotifyClientToken()
                if (!clientToken) {
                    res.status(503).json({
                        error: 'Failed to get Spotify token',
                    })
                    return
                }

                const suggestions = new Map<string, SpotifyArtist>()

                const link = await spotifyLinkService.getValidAccessToken(
                    discordUserId,
                )
                if (link) {
                    const userCacheKey = `${USER_TOP_ARTISTS_CACHE_PREFIX}${discordUserId}`
                    let cachedTop: SpotifyArtist[] | null = null
                    try {
                        const cached = await redisClient.get(userCacheKey)
                        if (cached) {
                            cachedTop = JSON.parse(cached) as SpotifyArtist[]
                        }
                    } catch {
                        // Redis miss/error — fall through to Spotify
                    }

                    if (cachedTop && cachedTop.length > 0) {
                        for (const artist of cachedTop) {
                            if (suggestions.size >= MAX_SUGGESTIONS) break
                            suggestions.set(artist.id, artist)
                        }
                    } else {
                        try {
                            // Fetch top artists across 3 time ranges in parallel
                            const timeRanges = ['short_term', 'medium_term', 'long_term'] as const
                            const promises = timeRanges.map((range) =>
                                fetch(
                                    `https://api.spotify.com/v1/me/top/artists?limit=50&time_range=${range}`,
                                    {
                                        headers: {
                                            Authorization: `Bearer ${link}`,
                                        },
                                    },
                                )
                            )
                            const responses = await Promise.all(promises)
                            const collected: SpotifyArtist[] = []
                            for (const res of responses) {
                                if (res.ok) {
                                    const data = (await res.json()) as {
                                        items?: unknown[]
                                    }
                                    if (Array.isArray(data.items)) {
                                        for (const item of data.items) {
                                            const artist = item as {
                                                id?: string
                                                name?: string
                                                images?: { url: string }[]
                                                popularity?: number
                                                genres?: string[]
                                            }
                                            if (
                                                artist.id &&
                                                artist.name &&
                                                suggestions.size < MAX_SUGGESTIONS
                                            ) {
                                                const entry: SpotifyArtist = {
                                                    id: artist.id,
                                                    name: artist.name,
                                                    imageUrl:
                                                        artist.images?.[0]?.url ?? null,
                                                    popularity: artist.popularity ?? 0,
                                                    genres: artist.genres ?? [],
                                                }
                                                if (!suggestions.has(artist.id)) {
                                                    collected.push(entry)
                                                }
                                                suggestions.set(artist.id, entry)
                                            }
                                        }
                                    }
                                }
                            }
                            if (collected.length > 0) {
                                try {
                                    await redisClient.setex(
                                        userCacheKey,
                                        USER_TOP_ARTISTS_TTL_SECONDS,
                                        JSON.stringify(collected),
                                    )
                                } catch {
                                    // Cache write failure is non-fatal
                                }
                            }
                        } catch {
                            // Fall back to popular artists
                        }
                    }
                }

                if (suggestions.size < MAX_SUGGESTIONS) {
                    // Cached fallback: avoid hammering Spotify search (429s on
                    // every page load otherwise). Cache the popular-artists
                    // bundle in Redis for 1h.
                    let fallback: SpotifyArtist[] = []
                    try {
                        const cached = await redisClient.get(
                            FALLBACK_SUGGESTIONS_CACHE_KEY,
                        )
                        if (cached) {
                            fallback = JSON.parse(cached) as SpotifyArtist[]
                        }
                    } catch {
                        // Redis miss/error — fall through to live fetch
                    }

                    if (fallback.length === 0) {
                        const suggestQueries = [
                            // Pop
                            'Taylor Swift',
                            'Dua Lipa',
                            'Ariana Grande',
                            'Olivia Rodrigo',
                            'Sabrina Carpenter',
                            'Billie Eilish',
                            'The Weeknd',
                            // Hip-hop
                            'Drake',
                            'Kendrick Lamar',
                            'Travis Scott',
                            'J. Cole',
                            'Tyler The Creator',
                            'Future',
                            'Nicki Minaj',
                            // Rock
                            'Foo Fighters',
                            'Red Hot Chili Peppers',
                            'Arctic Monkeys',
                            'Radiohead',
                            'The Strokes',
                            'Tame Impala',
                            // R&B
                            'SZA',
                            'Frank Ocean',
                            'Bruno Mars',
                            'H.E.R.',
                            'Daniel Caesar',
                            // Electronic
                            'Daft Punk',
                            'Calvin Harris',
                            'Flume',
                            'ODESZA',
                            'Disclosure',
                            'Skrillex',
                            // Latin
                            'Bad Bunny',
                            'Anitta',
                            'Karol G',
                            'J Balvin',
                            'Rosalía',
                            'Peso Pluma',
                            // Country
                            'Morgan Wallen',
                            'Luke Combs',
                            'Kacey Musgraves',
                            'Zach Bryan',
                            // Indie
                            'Phoebe Bridgers',
                            'Arcade Fire',
                            'Vampire Weekend',
                            'Mac DeMarco',
                            // K-pop
                            'BTS',
                            'BLACKPINK',
                            'NewJeans',
                            'Stray Kids',
                            // Classic rock
                            'The Beatles',
                            'Queen',
                            'Pink Floyd',
                            'Led Zeppelin',
                            // Jazz
                            'Miles Davis',
                            'John Coltrane',
                            'Nina Simone',
                            // Metal
                            'Metallica',
                            'Tool',
                            'System of a Down',
                            // Brazilian
                            'Matuê',
                            'Tim Bernardes',
                            'Racionais',
                            'Djonga',
                        ]
                        const seen = new Set<string>()
                        for (const query of suggestQueries) {
                            if (fallback.length >= MAX_SUGGESTIONS) break
                            try {
                                const artists = await searchSpotifyArtists(
                                    clientToken,
                                    query,
                                    6,
                                )
                                for (const artist of artists) {
                                    if (fallback.length >= MAX_SUGGESTIONS) break
                                    if (!seen.has(artist.id)) {
                                        seen.add(artist.id)
                                        fallback.push(artist)
                                    }
                                }
                            } catch {
                                // continue to next query
                            }
                        }
                        if (fallback.length > 0) {
                            try {
                                await redisClient.setex(
                                    FALLBACK_SUGGESTIONS_CACHE_KEY,
                                    FALLBACK_SUGGESTIONS_TTL_SECONDS,
                                    JSON.stringify(fallback),
                                )
                            } catch {
                                // Cache write failure is non-fatal
                            }
                        }
                    }

                    for (const artist of fallback) {
                        if (suggestions.size >= MAX_SUGGESTIONS) break
                        if (!suggestions.has(artist.id)) {
                            suggestions.set(artist.id, artist)
                        }
                    }
                }

                res.set('Cache-Control', 'no-cache, no-store, must-revalidate')
                res.json({
                    artists: Array.from(suggestions.values()),
                })
            } catch (error) {
                errorLog({
                    message: 'Artist suggestions error',
                    error,
                })
                res.status(500).json({ error: 'Failed to get suggestions' })
            }
        },
    )

    app.get(
        '/api/artists/search',
        apiLimiter,
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const query =
                    typeof req.query.q === 'string' ? req.query.q.trim() : ''
                if (!query) {
                    res.status(400).json({ error: 'Missing query parameter q' })
                    return
                }
                if (!isSpotifyAuthConfigured()) {
                    res.status(503).json({ error: 'Spotify not configured' })
                    return
                }
                const token = await getSpotifyClientToken()
                if (!token) {
                    res.status(503).json({
                        error: 'Failed to get Spotify token',
                    })
                    return
                }
                const artists = await searchSpotifyArtists(token, query, 12)
                res.json({ artists })
            } catch (error) {
                errorLog({ message: 'Artist search error', error })
                res.status(500).json({ error: 'Failed to search artists' })
            }
        },
    )

    app.get(
        '/api/artists/:artistId/related',
        apiLimiter,
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const artistId = req.params.artistId as string
                if (!isSpotifyAuthConfigured()) {
                    res.status(503).json({ error: 'Spotify not configured' })
                    return
                }
                const token = await getSpotifyClientToken()
                if (!token) {
                    res.status(503).json({
                        error: 'Failed to get Spotify token',
                    })
                    return
                }
                const artists = await getSpotifyRelatedArtists(token, artistId)
                res.json({ artists })
            } catch (error) {
                errorLog({ message: 'Related artists error', error })
                res.status(500).json({ error: 'Failed to get related artists' })
            }
        },
    )

    app.get(
        '/api/users/me/preferred-artists',
        apiLimiter,
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const discordUserId = req.user?.id
                if (!discordUserId) {
                    res.status(401).json({ error: 'Not authenticated' })
                    return
                }
                const guildId =
                    typeof req.query.guildId === 'string'
                        ? req.query.guildId
                        : undefined
                const db = getPrismaClient()
                const prefs = await db.userArtistPreference.findMany({
                    where: { discordUserId, ...(guildId ? { guildId } : {}) },
                    orderBy: { createdAt: 'desc' },
                })
                res.json({ preferences: prefs })
            } catch (error) {
                errorLog({ message: 'Get preferred artists error', error })
                res.status(500).json({ error: 'Failed to get preferences' })
            }
        },
    )

    app.post(
        '/api/users/me/preferred-artists',
        writeLimiter,
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const discordUserId = req.user?.id
                if (!discordUserId) {
                    res.status(401).json({ error: 'Not authenticated' })
                    return
                }
                const parsed = saveArtistBody.safeParse(req.body)
                if (!parsed.success) {
                    res.status(400).json({ error: parsed.error.message })
                    return
                }
                const { guildId, artistName, spotifyId, imageUrl, preference } =
                    parsed.data
                const artistKey = normalizeArtistKey(
                    parsed.data.artistKey || artistName,
                )
                const db = getPrismaClient()
                const pref = await db.userArtistPreference.upsert({
                    where: {
                        discordUserId_guildId_artistKey: {
                            discordUserId,
                            guildId,
                            artistKey,
                        },
                    },
                    update: { artistName, spotifyId, imageUrl, preference },
                    create: {
                        discordUserId,
                        guildId,
                        artistKey,
                        artistName,
                        spotifyId,
                        imageUrl,
                        preference,
                    },
                })
                res.json({ preference: pref })
            } catch (error) {
                errorLog({ message: 'Save preferred artist error', error })
                res.status(500).json({ error: 'Failed to save preference' })
            }
        },
    )

    app.put(
        '/api/artists/preferences/batch',
        writeLimiter,
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const discordUserId = req.user?.id
                if (!discordUserId) {
                    res.status(401).json({ error: 'Not authenticated' })
                    return
                }
                const parsed = saveArtistBatchBody.safeParse(req.body)
                if (!parsed.success) {
                    res.status(400).json({ error: parsed.error.message })
                    return
                }
                const { guildId, items } = parsed.data
                const db = getPrismaClient()
                const results: typeof items = []
                for (const item of items) {
                    const artistKey = normalizeArtistKey(
                        item.artistKey || item.artistName,
                    )
                    const pref = await db.userArtistPreference.upsert({
                        where: {
                            discordUserId_guildId_artistKey: {
                                discordUserId,
                                guildId,
                                artistKey,
                            },
                        },
                        update: {
                            artistName: item.artistName,
                            spotifyId: item.artistId,
                            imageUrl: item.imageUrl,
                            preference: item.preference,
                        },
                        create: {
                            discordUserId,
                            guildId,
                            artistKey,
                            artistName: item.artistName,
                            spotifyId: item.artistId,
                            imageUrl: item.imageUrl,
                            preference: item.preference,
                        },
                    })
                    results.push(pref as unknown as typeof items[0])
                }
                res.json({ preferences: results })
            } catch (error) {
                errorLog({ message: 'Batch save preferences error', error })
                res.status(500).json({ error: 'Failed to save preferences' })
            }
        },
    )

    app.delete(
        '/api/users/me/preferred-artists/:artistKey',
        writeLimiter,
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const discordUserId = req.user?.id
                if (!discordUserId) {
                    res.status(401).json({ error: 'Not authenticated' })
                    return
                }
                const artistKey = req.params.artistKey as string
                const guildId =
                    typeof req.query.guildId === 'string'
                        ? req.query.guildId
                        : undefined
                if (!guildId) {
                    res.status(400).json({
                        error: 'Missing guildId query param',
                    })
                    return
                }
                const db = getPrismaClient()
                await db.userArtistPreference.delete({
                    where: {
                        discordUserId_guildId_artistKey: {
                            discordUserId,
                            guildId,
                            artistKey,
                        },
                    },
                })
                res.json({ success: true })
            } catch (error) {
                errorLog({ message: 'Delete preferred artist error', error })
                res.status(500).json({ error: 'Failed to delete preference' })
            }
        },
    )
}
