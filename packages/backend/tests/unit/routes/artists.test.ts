import {
    describe,
    test,
    expect,
    jest,
    beforeEach,
    afterEach,
} from '@jest/globals'
import type { Request, Response, NextFunction } from 'express'

// Mock shared utilities before import
jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    getPrismaClient: jest.fn(),
    searchSpotifyArtists: jest.fn(),
    getSpotifyRelatedArtists: jest.fn(),
}))

// Mock SpotifyAuthService
jest.mock('../../../src/services/SpotifyAuthService', () => ({
    getSpotifyClientToken: jest.fn(),
    isSpotifyAuthConfigured: jest.fn(),
}))

// Mock auth middleware — attach user to req
jest.mock('../../../src/middleware/auth', () => ({
    requireAuth: (req: Request, _res: Response, next: NextFunction) => {
        ;(req as any).user = { id: 'user-123' }
        next()
    },
}))

import express from 'express'
import request from 'supertest'
import { setupArtistsRoutes } from '../../../src/routes/artists'
import * as sharedUtils from '@lucky/shared/utils'
import * as spotifyAuth from '../../../src/services/SpotifyAuthService'

function createApp() {
    const app = express()
    app.use(express.json())
    setupArtistsRoutes(app)
    app.use(
        (
            err: { statusCode?: number; message: string },
            _req: Request,
            res: Response,
            _next: NextFunction,
        ) => {
            res.status(err.statusCode ?? 500).json({ error: err.message })
        },
    )
    return app
}

const mockDb = {
    userArtistPreference: {
        findMany: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
    },
}

describe('Artists Routes', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        ;(sharedUtils.getPrismaClient as jest.Mock).mockReturnValue(mockDb)
    })

    describe('GET /api/artists/search', () => {
        test('returns 400 when q param is missing', async () => {
            const app = createApp()
            const res = await request(app).get('/api/artists/search')
            expect(res.status).toBe(400)
            expect(res.body.error).toBe('Missing query parameter q')
        })

        test('returns 400 when q param is empty string', async () => {
            const app = createApp()
            const res = await request(app)
                .get('/api/artists/search')
                .query({ q: '   ' })
            expect(res.status).toBe(400)
            expect(res.body.error).toBe('Missing query parameter q')
        })

        test('returns 503 when Spotify is not configured', async () => {
            ;(spotifyAuth.isSpotifyAuthConfigured as jest.Mock).mockReturnValue(
                false,
            )
            const app = createApp()
            const res = await request(app)
                .get('/api/artists/search')
                .query({ q: 'Drake' })
            expect(res.status).toBe(503)
            expect(res.body.error).toBe('Spotify not configured')
        })

        test('returns 503 when getSpotifyClientToken fails', async () => {
            ;(spotifyAuth.isSpotifyAuthConfigured as jest.Mock).mockReturnValue(
                true,
            )
            ;(spotifyAuth.getSpotifyClientToken as jest.Mock).mockResolvedValue(
                null,
            )
            const app = createApp()
            const res = await request(app)
                .get('/api/artists/search')
                .query({ q: 'Drake' })
            expect(res.status).toBe(503)
            expect(res.body.error).toBe('Failed to get Spotify token')
        })

        test('returns 200 with artists array on success', async () => {
            ;(spotifyAuth.isSpotifyAuthConfigured as jest.Mock).mockReturnValue(
                true,
            )
            ;(spotifyAuth.getSpotifyClientToken as jest.Mock).mockResolvedValue(
                'test-token',
            )
            const mockArtists = [
                {
                    id: 'artist-1',
                    name: 'Drake',
                    image: 'https://example.com/drake.jpg',
                },
                {
                    id: 'artist-2',
                    name: 'The Weeknd',
                    image: 'https://example.com/weeknd.jpg',
                },
            ]
            ;(sharedUtils.searchSpotifyArtists as jest.Mock).mockResolvedValue(
                mockArtists,
            )
            const app = createApp()
            const res = await request(app)
                .get('/api/artists/search')
                .query({ q: 'Drake' })
            expect(res.status).toBe(200)
            expect(res.body.artists).toEqual(mockArtists)
            expect(sharedUtils.searchSpotifyArtists).toHaveBeenCalledWith(
                'test-token',
                'Drake',
                12,
            )
        })

        test('returns 500 when searchSpotifyArtists throws', async () => {
            ;(spotifyAuth.isSpotifyAuthConfigured as jest.Mock).mockReturnValue(
                true,
            )
            ;(spotifyAuth.getSpotifyClientToken as jest.Mock).mockResolvedValue(
                'test-token',
            )
            ;(sharedUtils.searchSpotifyArtists as jest.Mock).mockRejectedValue(
                new Error('Spotify API error'),
            )
            const app = createApp()
            const res = await request(app)
                .get('/api/artists/search')
                .query({ q: 'Drake' })
            expect(res.status).toBe(500)
            expect(res.body.error).toBe('Failed to search artists')
            expect(sharedUtils.errorLog).toHaveBeenCalled()
        })
    })

    describe('GET /api/artists/:artistId/related', () => {
        test('returns 503 when Spotify is not configured', async () => {
            ;(spotifyAuth.isSpotifyAuthConfigured as jest.Mock).mockReturnValue(
                false,
            )
            const app = createApp()
            const res = await request(app).get(
                '/api/artists/artist-123/related',
            )
            expect(res.status).toBe(503)
            expect(res.body.error).toBe('Spotify not configured')
        })

        test('returns 503 when getSpotifyClientToken fails', async () => {
            ;(spotifyAuth.isSpotifyAuthConfigured as jest.Mock).mockReturnValue(
                true,
            )
            ;(spotifyAuth.getSpotifyClientToken as jest.Mock).mockResolvedValue(
                null,
            )
            const app = createApp()
            const res = await request(app).get(
                '/api/artists/artist-123/related',
            )
            expect(res.status).toBe(503)
            expect(res.body.error).toBe('Failed to get Spotify token')
        })

        test('returns 200 with related artists on success', async () => {
            ;(spotifyAuth.isSpotifyAuthConfigured as jest.Mock).mockReturnValue(
                true,
            )
            ;(spotifyAuth.getSpotifyClientToken as jest.Mock).mockResolvedValue(
                'test-token',
            )
            const mockRelatedArtists = [
                { id: 'related-1', name: 'Artist 1' },
                { id: 'related-2', name: 'Artist 2' },
            ]
            ;(
                sharedUtils.getSpotifyRelatedArtists as jest.Mock
            ).mockResolvedValue(mockRelatedArtists)
            const app = createApp()
            const res = await request(app).get(
                '/api/artists/artist-123/related',
            )
            expect(res.status).toBe(200)
            expect(res.body.artists).toEqual(mockRelatedArtists)
            expect(sharedUtils.getSpotifyRelatedArtists).toHaveBeenCalledWith(
                'test-token',
                'artist-123',
            )
        })

        test('returns 500 when getSpotifyRelatedArtists throws', async () => {
            ;(spotifyAuth.isSpotifyAuthConfigured as jest.Mock).mockReturnValue(
                true,
            )
            ;(spotifyAuth.getSpotifyClientToken as jest.Mock).mockResolvedValue(
                'test-token',
            )
            ;(
                sharedUtils.getSpotifyRelatedArtists as jest.Mock
            ).mockRejectedValue(new Error('Spotify API error'))
            const app = createApp()
            const res = await request(app).get(
                '/api/artists/artist-123/related',
            )
            expect(res.status).toBe(500)
            expect(res.body.error).toBe('Failed to get related artists')
            expect(sharedUtils.errorLog).toHaveBeenCalled()
        })
    })

    describe('GET /api/users/me/preferred-artists', () => {
        test('returns 200 with preferences when guildId is provided', async () => {
            const mockPreferences = [
                {
                    discordUserId: 'user-123',
                    guildId: 'guild-1',
                    artistKey: 'drake',
                    artistName: 'Drake',
                    spotifyId: 'spotify-1',
                    imageUrl: 'https://example.com/image.jpg',
                    preference: 'prefer',
                    createdAt: '2024-01-01T00:00:00.000Z',
                    updatedAt: '2024-01-01T00:00:00.000Z',
                },
            ]
            ;(
                mockDb.userArtistPreference.findMany as jest.Mock
            ).mockResolvedValue(mockPreferences)
            const app = createApp()
            const res = await request(app)
                .get('/api/users/me/preferred-artists')
                .query({ guildId: 'guild-1' })
            expect(res.status).toBe(200)
            expect(res.body.preferences).toEqual(mockPreferences)
            expect(mockDb.userArtistPreference.findMany).toHaveBeenCalledWith({
                where: { discordUserId: 'user-123', guildId: 'guild-1' },
                orderBy: { createdAt: 'desc' },
            })
        })

        test('returns 200 with preferences without guildId filter', async () => {
            const mockPreferences = [
                {
                    discordUserId: 'user-123',
                    guildId: 'guild-1',
                    artistKey: 'drake',
                    artistName: 'Drake',
                    preference: 'prefer',
                    createdAt: '2024-01-01T00:00:00.000Z',
                    updatedAt: '2024-01-01T00:00:00.000Z',
                },
                {
                    discordUserId: 'user-123',
                    guildId: 'guild-2',
                    artistKey: 'weeknd',
                    artistName: 'The Weeknd',
                    preference: 'prefer',
                    createdAt: '2024-01-02T00:00:00.000Z',
                    updatedAt: '2024-01-02T00:00:00.000Z',
                },
            ]
            ;(
                mockDb.userArtistPreference.findMany as jest.Mock
            ).mockResolvedValue(mockPreferences)
            const app = createApp()
            const res = await request(app).get(
                '/api/users/me/preferred-artists',
            )
            expect(res.status).toBe(200)
            expect(res.body.preferences).toEqual(mockPreferences)
            expect(mockDb.userArtistPreference.findMany).toHaveBeenCalledWith({
                where: { discordUserId: 'user-123' },
                orderBy: { createdAt: 'desc' },
            })
        })

        test('returns 500 when database query fails', async () => {
            ;(
                mockDb.userArtistPreference.findMany as jest.Mock
            ).mockRejectedValue(new Error('Database error'))
            const app = createApp()
            const res = await request(app).get(
                '/api/users/me/preferred-artists',
            )
            expect(res.status).toBe(500)
            expect(res.body.error).toBe('Failed to get preferences')
            expect(sharedUtils.errorLog).toHaveBeenCalled()
        })
    })

    describe('POST /api/users/me/preferred-artists', () => {
        test('returns 400 when guildId is missing from body', async () => {
            const app = createApp()
            const res = await request(app)
                .post('/api/users/me/preferred-artists')
                .send({
                    artistKey: 'drake',
                    artistName: 'Drake',
                })
            expect(res.status).toBe(400)
            expect(res.body).toHaveProperty('error')
        })

        test('returns 400 when artistName is missing', async () => {
            const app = createApp()
            const res = await request(app)
                .post('/api/users/me/preferred-artists')
                .send({
                    guildId: 'guild-1',
                    artistKey: 'drake',
                })
            expect(res.status).toBe(400)
            expect(res.body).toHaveProperty('error')
        })

        test('returns 200 with saved preference on success', async () => {
            const mockPreference = {
                discordUserId: 'user-123',
                guildId: 'guild-1',
                artistKey: 'drake',
                artistName: 'Drake',
                spotifyId: 'spotify-1',
                imageUrl: 'https://example.com/drake.jpg',
                preference: 'prefer',
                createdAt: '2024-01-01T00:00:00.000Z',
                updatedAt: '2024-01-01T00:00:00.000Z',
            }
            ;(
                mockDb.userArtistPreference.upsert as jest.Mock
            ).mockResolvedValue(mockPreference)
            const app = createApp()
            const res = await request(app)
                .post('/api/users/me/preferred-artists')
                .send({
                    guildId: 'guild-1',
                    artistKey: 'Drake',
                    artistName: 'Drake',
                    spotifyId: 'spotify-1',
                    imageUrl: 'https://example.com/drake.jpg',
                    preference: 'prefer',
                })
            expect(res.status).toBe(200)
            expect(res.body.preference).toEqual(mockPreference)
            expect(mockDb.userArtistPreference.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        discordUserId_guildId_artistKey: {
                            discordUserId: 'user-123',
                            guildId: 'guild-1',
                            artistKey: 'drake',
                        },
                    },
                }),
            )
        })

        test('normalizes artistKey to lowercase alphanumeric', async () => {
            const mockPreference = {
                discordUserId: 'user-123',
                guildId: 'guild-1',
                artistKey: 'drakejcole',
                artistName: 'Drake & J Cole',
                preference: 'prefer',
                createdAt: '2024-01-01T00:00:00.000Z',
                updatedAt: '2024-01-01T00:00:00.000Z',
            }
            ;(
                mockDb.userArtistPreference.upsert as jest.Mock
            ).mockResolvedValue(mockPreference)
            const app = createApp()
            const res = await request(app)
                .post('/api/users/me/preferred-artists')
                .send({
                    guildId: 'guild-1',
                    artistKey: 'Drake & J Cole',
                    artistName: 'Drake & J Cole',
                    preference: 'prefer',
                })
            expect(res.status).toBe(200)
            expect(mockDb.userArtistPreference.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        discordUserId_guildId_artistKey: {
                            discordUserId: 'user-123',
                            guildId: 'guild-1',
                            artistKey: 'drakejcole',
                        },
                    },
                }),
            )
        })

        test('returns 400 when artistKey is missing (required field)', async () => {
            const app = createApp()
            const res = await request(app)
                .post('/api/users/me/preferred-artists')
                .send({
                    guildId: 'guild-1',
                    artistName: 'Drake',
                    preference: 'prefer',
                })
            expect(res.status).toBe(400)
            expect(res.body).toHaveProperty('error')
        })

        test('defaults preference to prefer when not specified', async () => {
            const mockPreference = {
                discordUserId: 'user-123',
                guildId: 'guild-1',
                artistKey: 'drake',
                artistName: 'Drake',
                preference: 'prefer',
                createdAt: '2024-01-01T00:00:00.000Z',
                updatedAt: '2024-01-01T00:00:00.000Z',
            }
            ;(
                mockDb.userArtistPreference.upsert as jest.Mock
            ).mockResolvedValue(mockPreference)
            const app = createApp()
            const res = await request(app)
                .post('/api/users/me/preferred-artists')
                .send({
                    guildId: 'guild-1',
                    artistKey: 'drake',
                    artistName: 'Drake',
                })
            expect(res.status).toBe(200)
            expect(mockDb.userArtistPreference.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    create: expect.objectContaining({
                        preference: 'prefer',
                    }),
                }),
            )
        })

        test('returns 500 when upsert fails', async () => {
            ;(
                mockDb.userArtistPreference.upsert as jest.Mock
            ).mockRejectedValue(new Error('Database error'))
            const app = createApp()
            const res = await request(app)
                .post('/api/users/me/preferred-artists')
                .send({
                    guildId: 'guild-1',
                    artistKey: 'drake',
                    artistName: 'Drake',
                })
            expect(res.status).toBe(500)
            expect(res.body.error).toBe('Failed to save preference')
            expect(sharedUtils.errorLog).toHaveBeenCalled()
        })
    })

    describe('DELETE /api/users/me/preferred-artists/:artistKey', () => {
        test('returns 400 when guildId query param is missing', async () => {
            const app = createApp()
            const res = await request(app).delete(
                '/api/users/me/preferred-artists/drake',
            )
            expect(res.status).toBe(400)
            expect(res.body.error).toBe('Missing guildId query param')
        })

        test('returns 200 on successful delete', async () => {
            ;(
                mockDb.userArtistPreference.delete as jest.Mock
            ).mockResolvedValue({
                discordUserId: 'user-123',
                guildId: 'guild-1',
                artistKey: 'drake',
            })
            const app = createApp()
            const res = await request(app)
                .delete('/api/users/me/preferred-artists/drake')
                .query({ guildId: 'guild-1' })
            expect(res.status).toBe(200)
            expect(res.body.success).toBe(true)
            expect(mockDb.userArtistPreference.delete).toHaveBeenCalledWith({
                where: {
                    discordUserId_guildId_artistKey: {
                        discordUserId: 'user-123',
                        guildId: 'guild-1',
                        artistKey: 'drake',
                    },
                },
            })
        })

        test('returns 500 when delete fails', async () => {
            ;(
                mockDb.userArtistPreference.delete as jest.Mock
            ).mockRejectedValue(new Error('Database error'))
            const app = createApp()
            const res = await request(app)
                .delete('/api/users/me/preferred-artists/drake')
                .query({ guildId: 'guild-1' })
            expect(res.status).toBe(500)
            expect(res.body.error).toBe('Failed to delete preference')
            expect(sharedUtils.errorLog).toHaveBeenCalled()
        })
    })
})
