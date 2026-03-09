import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupHealthRoutes } from '../../../src/routes/health'
import { redisClient } from '@lucky/shared/services'

const mockRedis = redisClient as jest.Mocked<typeof redisClient>

describe('Health Routes Integration', () => {
    let app: express.Express

    beforeEach(() => {
        app = express()
        setupHealthRoutes(app)
        jest.clearAllMocks()
    })

    describe('GET /api/health', () => {
        test('should return ok status with redis healthy', async () => {
            mockRedis.isHealthy.mockReturnValue(true)

            const response = await request(app).get('/api/health').expect(200)

            expect(response.body.status).toBe('ok')
            expect(response.body.redis).toBe(true)
            expect(typeof response.body.uptime).toBe('number')
        })

        test('should reflect unhealthy redis', async () => {
            mockRedis.isHealthy.mockReturnValue(false)

            const response = await request(app).get('/api/health').expect(200)

            expect(response.body.status).toBe('ok')
            expect(response.body.redis).toBe(false)
        })
    })

    describe('GET /api/health/cache', () => {
        test('should return cache metrics', async () => {
            mockRedis.isHealthy.mockReturnValue(true)
            ;(mockRedis as any).getMetrics = jest.fn().mockReturnValue({
                hits: 150,
                misses: 50,
                errors: 2,
                total: 200,
                hitRate: 0.75,
            })

            const response = await request(app)
                .get('/api/health/cache')
                .expect(200)

            expect(response.body).toEqual({
                redis: true,
                cache: {
                    hits: 150,
                    misses: 50,
                    errors: 2,
                    total: 200,
                    hitRate: '75.0%',
                },
            })
        })

        test('should handle zero total requests', async () => {
            mockRedis.isHealthy.mockReturnValue(true)
            ;(mockRedis as any).getMetrics = jest.fn().mockReturnValue({
                hits: 0,
                misses: 0,
                errors: 0,
                total: 0,
                hitRate: 0,
            })

            const response = await request(app)
                .get('/api/health/cache')
                .expect(200)

            expect(response.body.cache.hitRate).toBe('0.0%')
            expect(response.body.cache.total).toBe(0)
        })

        test('should show redis unhealthy in cache response', async () => {
            mockRedis.isHealthy.mockReturnValue(false)
            ;(mockRedis as any).getMetrics = jest.fn().mockReturnValue({
                hits: 0,
                misses: 0,
                errors: 5,
                total: 5,
                hitRate: 0,
            })

            const response = await request(app)
                .get('/api/health/cache')
                .expect(200)

            expect(response.body.redis).toBe(false)
        })
    })
})
