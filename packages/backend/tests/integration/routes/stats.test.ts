import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupStatsRoutes } from '../../../src/routes/stats'
import { redisClient } from '@lucky/shared/services'

const mockRedis = redisClient as jest.Mocked<typeof redisClient>

// Mock the getPrismaClient function before importing setupStatsRoutes
jest.mock('@lucky/shared/utils', () => {
    const actualUtils = jest.requireActual('@lucky/shared/utils')
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
        getPrismaClientMock = utils.getPrismaClient as jest.Mock

        app = express()
        setupStatsRoutes(app)
    })

    describe('GET /api/stats/public', () => {
        test('should return stats with valid schema', async () => {
            const mockDb = {
                guild: { count: jest.fn().mockResolvedValue(100) },
                user: { count: jest.fn().mockResolvedValue(500) },
            }
            getPrismaClientMock.mockReturnValue(mockDb)
            mockRedis.isHealthy.mockReturnValue(true)

            const response = await request(app).get('/api/stats/public').expect(200)

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
                guild: { count: jest.fn().mockResolvedValue(50) },
                user: { count: jest.fn().mockResolvedValue(250) },
            }
            getPrismaClientMock.mockReturnValue(mockDb)
            mockRedis.isHealthy.mockReturnValue(false)

            const response = await request(app).get('/api/stats/public').expect(200)

            expect(response.body.serversOnline).toBe(0)
            expect(response.body.totalGuilds).toBe(50)
            expect(response.body.totalUsers).toBe(250)
        })

        test('should return correct cache headers', async () => {
            const mockDb = {
                guild: { count: jest.fn().mockResolvedValue(10) },
                user: { count: jest.fn().mockResolvedValue(100) },
            }
            getPrismaClientMock.mockReturnValue(mockDb)
            mockRedis.isHealthy.mockReturnValue(true)

            const response = await request(app).get('/api/stats/public').expect(200)

            expect(response.headers['cache-control']).toContain('max-age=60')
            expect(response.headers['cache-control']).toContain('public')
            expect(response.headers['content-type']).toContain('application/json')
        })
    })
})
