import { describe, test, expect, beforeEach, jest } from '@jest/globals'

jest.mock('../../src/services/SessionService', () => ({
    sessionService: {
        getSession: jest.fn(),
        setSession: jest.fn(),
        deleteSession: jest.fn(),
    },
}))

jest.mock('@lucky/shared/services', () => ({
    ...jest.requireActual('@lucky/shared/services'),
    getSummary: jest.fn(),
    getPerSourceAcceptance: jest.fn(),
}))

import request from 'supertest'
import express from 'express'
import { setupRecommendationsRoutes } from '../../src/routes/recommendations'
import { setupSessionMiddleware } from '../../src/middleware/session'
import { sessionService } from '../../src/services/SessionService'
import { getSummary, getPerSourceAcceptance } from '@lucky/shared/services'
import { MOCK_SESSION_DATA, MOCK_SESSION_ID } from '../fixtures/mock-data'

const SESSION_COOKIE = [`sessionId=${MOCK_SESSION_ID}`]

describe('Recommendations Routes', () => {
    let app: express.Express

    beforeEach(() => {
        jest.clearAllMocks()

        app = express()
        app.use(express.json())
        setupSessionMiddleware(app)
        setupRecommendationsRoutes(app)

        const mockSessionService = sessionService as jest.Mocked<
            typeof sessionService
        >
        mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)
    })

    describe('GET /api/guilds/:guildId/recommendations/history', () => {
        test('should return 200 with summary and perSource data on success', async () => {
            const mockSummary = {
                totalPicks: 100,
                accepted: 60,
                rejected: 30,
                pending: 10,
                globalAcceptanceRate: 0.6666666666666666,
            }

            const mockPerSource = [
                {
                    source: 'autoplay',
                    count: 50,
                    acceptedCount: 35,
                    rejectedCount: 10,
                    pendingCount: 5,
                    acceptanceRate: 0.7777777777777778,
                },
                {
                    source: 'manual',
                    count: 50,
                    acceptedCount: 25,
                    rejectedCount: 20,
                    pendingCount: 5,
                    acceptanceRate: 0.5555555555555556,
                },
            ]

            ;(getSummary as jest.Mock).mockResolvedValue(mockSummary)
            ;(getPerSourceAcceptance as jest.Mock).mockResolvedValue(
                mockPerSource,
            )

            const res = await request(app)
                .get('/api/guilds/111111111111111111/recommendations/history')
                .set('Cookie', SESSION_COOKIE)

            expect(res.status).toBe(200)
            expect(res.body).toEqual({
                summary: mockSummary,
                perSource: mockPerSource,
            })
            expect(getSummary).toHaveBeenCalledWith(
                '111111111111111111',
                undefined,
            )
            expect(getPerSourceAcceptance).toHaveBeenCalledWith(
                '111111111111111111',
                undefined,
            )
        })

        test('should respect days query parameter', async () => {
            const mockSummary = {
                totalPicks: 50,
                accepted: 30,
                rejected: 15,
                pending: 5,
                globalAcceptanceRate: 0.6666666666666666,
            }

            const mockPerSource = []

            ;(getSummary as jest.Mock).mockResolvedValue(mockSummary)
            ;(getPerSourceAcceptance as jest.Mock).mockResolvedValue(
                mockPerSource,
            )

            const res = await request(app)
                .get(
                    '/api/guilds/111111111111111111/recommendations/history?days=14',
                )
                .set('Cookie', SESSION_COOKIE)

            expect(res.status).toBe(200)
            expect(getSummary).toHaveBeenCalledWith('111111111111111111', 14)
            expect(getPerSourceAcceptance).toHaveBeenCalledWith(
                '111111111111111111',
                14,
            )
        })

        test('should reject days > 30 with 400', async () => {
            const res = await request(app)
                .get(
                    '/api/guilds/111111111111111111/recommendations/history?days=999',
                )
                .set('Cookie', SESSION_COOKIE)

            expect(res.status).toBe(400)
        })

        test('should reject invalid guildId with 400', async () => {
            const res = await request(app)
                .get('/api/guilds/invalid-id/recommendations/history')
                .set('Cookie', SESSION_COOKIE)

            expect(res.status).toBe(400)
        })

        test('should return 401 when not authenticated', async () => {
            const res = await request(app).get(
                '/api/guilds/111111111111111111/recommendations/history',
            )

            expect(res.status).toBe(401)
        })

        test('should return 500 when service throws', async () => {
            ;(getSummary as jest.Mock).mockRejectedValue(
                new Error('Database error'),
            )

            const res = await request(app)
                .get('/api/guilds/111111111111111111/recommendations/history')
                .set('Cookie', SESSION_COOKIE)

            expect(res.status).toBe(500)
        })
    })
})
