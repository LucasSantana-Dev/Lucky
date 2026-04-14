import { errorHandler } from '../../../src/middleware/errorHandler'
import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupTrackHistoryRoutes } from '../../../src/routes/trackHistory'
import { setupSessionMiddleware } from '../../../src/middleware/session'
import { sessionService } from '../../../src/services/SessionService'
import { MOCK_SESSION_DATA } from '../../fixtures/mock-data'

jest.mock('../../../src/services/SessionService', () => ({
    sessionService: {
        getSession: jest.fn(),
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
        setupTrackHistoryRoutes(app)
        app.use(errorHandler)
        jest.clearAllMocks()
    })

    const GUILD_ID = '111111111111111111'

    function authed() {
        const mock = sessionService as jest.Mocked<typeof sessionService>
        mock.getSession.mockResolvedValue(MOCK_SESSION_DATA)
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
})
