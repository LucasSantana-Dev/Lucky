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
