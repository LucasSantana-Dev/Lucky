import type { Express, Response } from 'express'
import { z } from 'zod'
import {
    errorLog,
    getPrismaClient,
    searchSpotifyArtists,
    getSpotifyRelatedArtists,
} from '@lucky/shared/utils'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { apiLimiter, writeLimiter } from '../middleware/rateLimit'
import {
    isSpotifyAuthConfigured,
    getSpotifyClientToken,
} from '../services/SpotifyAuthService'
import { ArtistSuggestionService } from '../services/artistSuggestion'

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

// Initialize the suggestion service singleton
const suggestionService = new ArtistSuggestionService()

// Prewarm the suggestions cache on startup
void suggestionService.prewarmCache()

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

                const suggestions =
                    await suggestionService.getSuggestions(discordUserId)
                if (suggestions.length === 0) {
                    res.set('Cache-Control', 'no-store')
                    res.status(503).json({
                        error: 'Artist suggestions temporarily unavailable',
                    })
                    return
                }

                res.set('Cache-Control', 'no-cache, no-store, must-revalidate')
                res.json({ artists: suggestions })
            } catch (error) {
                errorLog({ message: 'Artist suggestions error', error })
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
                    results.push(pref as unknown as (typeof items)[0])
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
