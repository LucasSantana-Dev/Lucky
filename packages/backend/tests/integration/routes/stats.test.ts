import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupStatsRoutes } from '../../../src/routes/stats'
import { redisClient } from '@lucky/shared/services'
import type { AsyncMockFn } from '../../fixtures/mock-types'

const mockRedis = redisClient as jest.Mocked<typeof redisClient>

// Mock the getPrismaClient function before importing setupStatsRoutes
jest.mock('@lucky/shared/utils', () => {
    const actualUtils = jest.requireActual<Record<string, unknown>>(
        '@lucky/shared/utils',
    )
    return {
        ...actualUtils,
        getPrismaClient: jest.fn(() => ({
            guild: { count: jest.fn() },
            user: { count: jest.fn() },
        })),
    }
})

describe('Stats Routes Integration', () => {
    let app: express.Express
    let getPrismaClientMock: jest.Mock

    beforeEach(() => {
        jest.clearAllMocks()

        // Get the mocked getPrismaClient
        const utils = require('@lucky/shared/utils')
        getPrismaClientMock = jest.mocked(utils.getPrismaClient)

        app = express()
        setupStatsRoutes(app)
    })

    describe('GET /api/stats/public', () => {
        test('should return stats with valid schema', async () => {
            const mockDb = {
                guild: { count: jest.fn<AsyncMockFn>().mockResolvedValue(100) },
                user: { count: jest.fn<AsyncMockFn>().mockResolvedValue(0) },
            }
            getPrismaClientMock.mockReturnValue(mockDb)
            mockRedis.isHealthy.mockReturnValue(true)
            // totalUsers is member reach published to Redis by the bot, not a DB count.
            mockRedis.get.mockResolvedValue('500')

            const response = await request(app)
                .get('/api/stats/public')
                .expect(200)

            expect(response.body).toMatchObject({
                totalGuilds: 100,
                totalUsers: 500,
                uptimeSeconds: expect.any(Number),
                serversOnline: 1,
            })

            expect(response.body.uptimeSeconds).toBeGreaterThan(0)
            expect(response.body.totalGuilds).toBe(100)
            expect(response.body.totalUsers).toBe(500)
        })

        test('should handle redis unhealthy', async () => {
            const mockDb = {
                guild: { count: jest.fn<AsyncMockFn>().mockResolvedValue(50) },
                user: { count: jest.fn<AsyncMockFn>().mockResolvedValue(0) },
            }
            getPrismaClientMock.mockReturnValue(mockDb)
            mockRedis.isHealthy.mockReturnValue(false)
            // Redis unhealthy → no member-reach key → totalUsers falls back to 0.
            mockRedis.get.mockResolvedValue(null)

            const response = await request(app)
                .get('/api/stats/public')
                .expect(200)

            expect(response.body.serversOnline).toBe(0)
            expect(response.body.totalGuilds).toBe(50)
            expect(response.body.totalUsers).toBe(0)
        })

        test('should return correct cache headers', async () => {
            const mockDb = {
                guild: { count: jest.fn<AsyncMockFn>().mockResolvedValue(10) },
                user: { count: jest.fn<AsyncMockFn>().mockResolvedValue(100) },
            }
            getPrismaClientMock.mockReturnValue(mockDb)
            mockRedis.isHealthy.mockReturnValue(true)

            const response = await request(app)
                .get('/api/stats/public')
                .expect(200)

            expect(response.headers['cache-control']).toContain('max-age=60')
            expect(response.headers['cache-control']).toContain('public')
            expect(response.headers['content-type']).toContain(
                'application/json',
            )
        })
    })
})
