import type { Express, Response } from 'express'
import { z } from 'zod'
import {
    errorLog,
    getPrismaClient,
    searchSpotifyArtists,
    getSpotifyRelatedArtists,
} from '@lucky/shared/utils'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import {
    getSpotifyClientToken,
    isSpotifyAuthConfigured,
} from '../services/SpotifyAuthService'
import { spotifyLinkService } from '@lucky/shared/services'

const saveArtistBody = z.object({
    guildId: z.string().min(1),
    artistKey: z.string().min(1),
    artistName: z.string().min(1),
    spotifyId: z.string().optional(),
    imageUrl: z.string().optional(),
    preference: z.enum(['prefer', 'block']).default('prefer'),
})

function normalizeArtistKey(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function setupArtistsRoutes(app: Express): void {
    app.get(
        '/api/artists/suggestions',
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

                const suggestions = new Map<string, any>()

                const link = await spotifyLinkService.getValidAccessToken(
                    discordUserId,
                )
                if (link) {
                    try {
                        const userTopRes = await fetch(
                            'https://api.spotify.com/v1/me/top/artists?limit=12&time_range=medium_term',
                            {
                                headers: {
                                    Authorization: `Bearer ${link}`,
                                },
                            },
                        )
                        if (userTopRes.ok) {
                            const data = (await userTopRes.json()) as {
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
                                        suggestions.size < 12
                                    ) {
                                        suggestions.set(artist.id, {
                                            id: artist.id,
                                            name: artist.name,
                                            imageUrl:
                                                artist.images?.[0]?.url ?? null,
                                            popularity: artist.popularity ?? 0,
                                            genres: artist.genres ?? [],
                                        })
                                    }
                                }
                            }
                        }
                    } catch {
                        // Fall back to popular artists
                    }
                }

                if (suggestions.size < 12) {
                    const suggestQueries = [
                        'Drake',
                        'The Weeknd',
                        'Dua Lipa',
                        'Billie Eilish',
                        'Bad Bunny',
                        'Ariana Grande',
                        'Taylor Swift',
                        'Ed Sheeran',
                    ]
                    for (const query of suggestQueries) {
                        if (suggestions.size >= 12) break
                        try {
                            const artists = await searchSpotifyArtists(
                                clientToken,
                                query,
                                2,
                            )
                            for (const artist of artists) {
                                if (suggestions.size >= 12) break
                                if (!suggestions.has(artist.id)) {
                                    suggestions.set(artist.id, artist)
                                }
                            }
                        } catch {
                            // continue to next query
                        }
                    }
                }

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

    app.delete(
        '/api/users/me/preferred-artists/:artistKey',
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
