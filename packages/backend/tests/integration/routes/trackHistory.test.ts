import { errorHandler } from '../../../src/middleware/errorHandler'
import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupTrackHistoryRoutes } from '../../../src/routes/trackHistory'
import { setupSessionMiddleware } from '../../../src/middleware/session'
import { requireAuth } from '../../../src/middleware/auth'
import { requireGuildModuleAccess } from '../../../src/middleware/guildAccess'
import { sessionService } from '../../../src/services/SessionService'
import { guildAccessService } from '../../../src/services/GuildAccessService'
import { MOCK_SESSION_DATA, MOCK_GUILD_CONTEXT } from '../../fixtures/mock-data'

jest.mock('../../../src/services/SessionService', () => ({
    sessionService: {
        getSession: jest.fn(),
    },
}))

jest.mock('../../../src/services/GuildAccessService', () => ({
    guildAccessService: {
        resolveGuildContext: jest.fn(),
        hasAccess: jest.fn(),
    },
}))

const mockGetHistory = jest.fn<any>()
const mockGetHistoryCount = jest.fn<any>().mockResolvedValue(1)
const mockGenerateStats = jest.fn<any>()
const mockGetTopTracks = jest.fn<any>()
const mockGetTopArtists = jest.fn<any>()
const mockClearHistory = jest.fn<any>()

jest.mock('@lucky/shared/services', () => ({
    trackHistoryService: {
        getTrackHistory: (...args: any[]) => mockGetHistory(...args),
        getTrackHistoryCount: (...args: any[]) => mockGetHistoryCount(...args),
        generateStats: (...args: any[]) => mockGenerateStats(...args),
        getTopTracks: (...args: any[]) => mockGetTopTracks(...args),
        getTopArtists: (...args: any[]) => mockGetTopArtists(...args),
        clearHistory: (...args: any[]) => mockClearHistory(...args),
    },
}))

describe('Track History Routes', () => {
    let app: express.Express

    beforeEach(() => {
        app = express()
        app.use(express.json())
        setupSessionMiddleware(app)
        // Mirrors the guildGuardConfigs entry for '/api/guilds/:guildId/music'
        // in src/routes/index.ts, which prefix-matches this route's paths and
        // runs ahead of trackHistory.ts's own per-route check in production.
        app.use(
            '/api/guilds/:guildId/music',
            requireAuth,
            requireGuildModuleAccess('music'),
        )
        setupTrackHistoryRoutes(app)
        app.use(errorHandler)
        jest.clearAllMocks()
    })

    const GUILD_ID = '111111111111111111'

    function authed() {
        const mock = sessionService as jest.Mocked<typeof sessionService>
        mock.getSession.mockResolvedValue(MOCK_SESSION_DATA)

        const mockGuildAccessService = guildAccessService as jest.Mocked<
            typeof guildAccessService
        >
        mockGuildAccessService.resolveGuildContext.mockResolvedValue(
            MOCK_GUILD_CONTEXT,
        )
        mockGuildAccessService.hasAccess.mockReturnValue(true)
    }

    // Shared by both the global-guard suite and the route-level-only suite
    // below. Every mock asserts the module too (not just the mode) so a
    // guard accidentally protecting the wrong module (e.g. 'settings'
    // instead of 'music') flips the outcome and fails the suite, rather
    // than passing identically regardless of which module was checked.
    function noAccess() {
        authed()
        const mockGuildAccessService = guildAccessService as jest.Mocked<
            typeof guildAccessService
        >
        mockGuildAccessService.hasAccess.mockImplementation(
            (_context, module) => module !== 'music',
        )
    }

    function viewOnlyAccess() {
        authed()
        const mockGuildAccessService = guildAccessService as jest.Mocked<
            typeof guildAccessService
        >
        mockGuildAccessService.hasAccess.mockImplementation(
            (_context, module, mode) => module === 'music' && mode === 'view',
        )
    }

    function manageAccess() {
        authed()
        const mockGuildAccessService = guildAccessService as jest.Mocked<
            typeof guildAccessService
        >
        mockGuildAccessService.hasAccess.mockImplementation(
            (_context, module, mode) => module === 'music' && mode === 'manage',
        )
    }

    describe('GET /api/guilds/:guildId/music/history', () => {
        test('should return track history', async () => {
            authed()
            const history = [
                {
                    trackId: 't1',
                    title: 'Song A',
                    author: 'Artist',
                    duration: '3:45',
                    url: 'https://example.com/a',
                    timestamp: Date.now(),
                    guildId: GUILD_ID,
                },
            ]
            mockGetHistory.mockResolvedValue(history)

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/music/history`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
            expect(res.body.history).toHaveLength(1)
            expect(res.body.total).toBe(1)
            expect(mockGetHistory).toHaveBeenCalledWith(GUILD_ID, 10, 0)
        })

        test('should accept limit query param', async () => {
            authed()
            mockGetHistory.mockResolvedValue([])

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/music/history?limit=25`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
            expect(mockGetHistory).toHaveBeenCalledWith(GUILD_ID, 25, 0)
        })

        test('should return 401 when not authenticated', async () => {
            const mock = sessionService as jest.Mocked<typeof sessionService>
            mock.getSession.mockResolvedValue(null)

            const res = await request(app).get(
                `/api/guilds/${GUILD_ID}/music/history`,
            )

            expect(res.status).toBe(401)
        })
    })

    describe('GET /api/guilds/:guildId/music/history/stats', () => {
        test('should return stats', async () => {
            authed()
            const stats = {
                totalTracks: 42,
                totalPlayTime: 12345,
                topArtists: [],
                topTracks: [],
                lastUpdated: new Date().toISOString(),
            }
            mockGenerateStats.mockResolvedValue(stats)

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/music/history/stats`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
            expect(res.body.stats.totalTracks).toBe(42)
        })

        test('should return null stats for empty history', async () => {
            authed()
            mockGenerateStats.mockResolvedValue(null)

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/music/history/stats`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
            expect(res.body.stats).toBeNull()
        })
    })

    describe('GET /api/guilds/:guildId/music/history/top-tracks', () => {
        test('should return top tracks', async () => {
            authed()
            const tracks = [{ trackId: 't1', title: 'Popular Song', plays: 10 }]
            mockGetTopTracks.mockResolvedValue(tracks)

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/music/history/top-tracks`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
            expect(res.body.tracks).toHaveLength(1)
        })
    })

    describe('GET /api/guilds/:guildId/music/history/top-artists', () => {
        test('should return top artists', async () => {
            authed()
            const artists = [{ artist: 'Top Artist', plays: 15 }]
            mockGetTopArtists.mockResolvedValue(artists)

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/music/history/top-artists`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
            expect(res.body.artists).toHaveLength(1)
        })
    })

    describe('DELETE /api/guilds/:guildId/music/history', () => {
        test('should clear history', async () => {
            authed()
            mockClearHistory.mockResolvedValue(true)

            const res = await request(app)
                .delete(`/api/guilds/${GUILD_ID}/music/history`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
            expect(res.body.success).toBe(true)
            expect(mockClearHistory).toHaveBeenCalledWith(GUILD_ID)
        })
    })

    describe('guild module access', () => {
        test('returns 403 for GET history without guild module access', async () => {
            noAccess()

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/music/history`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(403)
            expect(mockGetHistory).not.toHaveBeenCalled()
        })

        test('returns 403 for GET stats without guild module access', async () => {
            noAccess()

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/music/history/stats`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(403)
            expect(mockGenerateStats).not.toHaveBeenCalled()
        })

        test('returns 403 for GET top-tracks without guild module access', async () => {
            noAccess()

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/music/history/top-tracks`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(403)
            expect(mockGetTopTracks).not.toHaveBeenCalled()
        })

        test('returns 403 for GET top-artists without guild module access', async () => {
            noAccess()

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/music/history/top-artists`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(403)
            expect(mockGetTopArtists).not.toHaveBeenCalled()
        })

        test('returns 403 for DELETE history without guild module access', async () => {
            noAccess()

            const res = await request(app)
                .delete(`/api/guilds/${GUILD_ID}/music/history`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(403)
            expect(mockClearHistory).not.toHaveBeenCalled()
        })

        test('allows GET endpoints but forbids DELETE for a view-only user', async () => {
            viewOnlyAccess()
            mockGetHistory.mockResolvedValue([])
            mockGenerateStats.mockResolvedValue(null)
            mockGetTopTracks.mockResolvedValue([])
            mockGetTopArtists.mockResolvedValue([])

            const history = await request(app)
                .get(`/api/guilds/${GUILD_ID}/music/history`)
                .set('Cookie', ['sessionId=valid_session_id'])
            expect(history.status).toBe(200)

            const stats = await request(app)
                .get(`/api/guilds/${GUILD_ID}/music/history/stats`)
                .set('Cookie', ['sessionId=valid_session_id'])
            expect(stats.status).toBe(200)

            const topTracks = await request(app)
                .get(`/api/guilds/${GUILD_ID}/music/history/top-tracks`)
                .set('Cookie', ['sessionId=valid_session_id'])
            expect(topTracks.status).toBe(200)

            const topArtists = await request(app)
                .get(`/api/guilds/${GUILD_ID}/music/history/top-artists`)
                .set('Cookie', ['sessionId=valid_session_id'])
            expect(topArtists.status).toBe(200)

            const del = await request(app)
                .delete(`/api/guilds/${GUILD_ID}/music/history`)
                .set('Cookie', ['sessionId=valid_session_id'])
            expect(del.status).toBe(403)
            expect(mockClearHistory).not.toHaveBeenCalled()
        })

        test('allows DELETE for a user with manage access', async () => {
            manageAccess()
            mockClearHistory.mockResolvedValue(true)

            const res = await request(app)
                .delete(`/api/guilds/${GUILD_ID}/music/history`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
            expect(res.body.success).toBe(true)
            expect(mockClearHistory).toHaveBeenCalledWith(GUILD_ID)
        })
    })

    // The suite above mounts the same global guildGuardConfigs guard that
    // production wires ahead of these routes in routes/index.ts. That guard
    // makes the exact same allow/deny decision as trackHistory.ts's own
    // per-route requireGuildModuleAccess calls and runs first, so it fully
    // shadows the route-level guard: those assertions would pass identically
    // even if the per-route checks were deleted. This block builds the app
    // from setupTrackHistoryRoutes alone, with no global guard mounted, so a
    // regression in the route-level guards is actually caught.
    describe('guild module access (route-level guard only, no global guard)', () => {
        function buildRouteOnlyApp(): express.Express {
            const routeOnlyApp = express()
            routeOnlyApp.use(express.json())
            setupSessionMiddleware(routeOnlyApp)
            setupTrackHistoryRoutes(routeOnlyApp)
            routeOnlyApp.use(errorHandler)
            return routeOnlyApp
        }

        test('denies GET history without music access', async () => {
            noAccess()

            const res = await request(buildRouteOnlyApp())
                .get(`/api/guilds/${GUILD_ID}/music/history`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(403)
            expect(mockGetHistory).not.toHaveBeenCalled()
        })

        test('allows GET history for a view-only user', async () => {
            viewOnlyAccess()
            mockGetHistory.mockResolvedValue([])

            const res = await request(buildRouteOnlyApp())
                .get(`/api/guilds/${GUILD_ID}/music/history`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
        })

        test('denies DELETE for a view-only user', async () => {
            viewOnlyAccess()

            const res = await request(buildRouteOnlyApp())
                .delete(`/api/guilds/${GUILD_ID}/music/history`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(403)
            expect(mockClearHistory).not.toHaveBeenCalled()
        })

        test('allows DELETE for a user with manage access', async () => {
            manageAccess()
            mockClearHistory.mockResolvedValue(true)

            const res = await request(buildRouteOnlyApp())
                .delete(`/api/guilds/${GUILD_ID}/music/history`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
            expect(res.body.success).toBe(true)
        })
    })
})
