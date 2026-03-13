import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import {
    setupHealthRoutes,
    getForwardedHeader,
    resolveRequestOrigin,
} from '../../../src/routes/health'
import { redisClient } from '@lucky/shared/services'

const mockRedis = redisClient as jest.Mocked<typeof redisClient>

describe('Health Routes Integration', () => {
    let app: express.Express

    beforeEach(() => {
        app = express()
        setupHealthRoutes(app)
        jest.clearAllMocks()
        process.env.CLIENT_ID = 'test-client-id'
        process.env.WEBAPP_SESSION_SECRET = 'test-session-secret'
        process.env.WEBAPP_FRONTEND_URL =
            'https://lucky.lucassantana.tech,https://lukbot.vercel.app'
        process.env.WEBAPP_REDIRECT_URI =
            'https://lucky-api.lucassantana.tech/api/auth/callback'
        process.env.WEBAPP_BACKEND_URL = 'https://lucky-api.lucassantana.tech'
        delete process.env.WEBAPP_EXPECTED_CLIENT_ID
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

    describe('GET /api/health/auth-config', () => {
        test('should return ok auth-config status when required values are present', async () => {
            mockRedis.isHealthy.mockReturnValue(true)

            const response = await request(app)
                .get('/api/health/auth-config')
                .expect(200)

            expect(response.body).toEqual({
                status: 'ok',
                auth: {
                    clientId: 'test-client-id',
                    redirectUri:
                        'https://lucky-api.lucassantana.tech/api/auth/callback',
                    frontendOrigins: [
                        'https://lucky.lucassantana.tech',
                        'https://lukbot.vercel.app',
                    ],
                    clientIdConfigured: true,
                    sessionSecretConfigured: true,
                    redisHealthy: true,
                    authorizeUrlPreview:
                        'https://discord.com/api/oauth2/authorize?client_id=test-client-id&redirect_uri=https%3A%2F%2Flucky-api.lucassantana.tech%2Fapi%2Fauth%2Fcallback&response_type=code&scope=identify%20guilds',
                },
                warnings: [],
            })
            expect(response.body.auth.clientSecret).toBeUndefined()
            expect(response.body.auth.authorizeUrlPreview).not.toContain(
                'client_secret=',
            )
        })

        test('should return degraded status with warnings when required values are missing', async () => {
            mockRedis.isHealthy.mockReturnValue(false)
            process.env.CLIENT_ID = ''
            process.env.WEBAPP_SESSION_SECRET = ''
            process.env.WEBAPP_REDIRECT_URI =
                'http://localhost:3000/auth/callback'

            const response = await request(app)
                .get('/api/health/auth-config')
                .expect(200)

            expect(response.body.status).toBe('degraded')
            expect(response.body.auth.clientId).toBe('')
            expect(response.body.auth.clientIdConfigured).toBe(false)
            expect(response.body.auth.sessionSecretConfigured).toBe(false)
            expect(response.body.auth.redisHealthy).toBe(false)
            expect(response.body.auth.redirectUri).toBe(
                'http://localhost:3000/api/auth/callback',
            )
            expect(response.body.auth.authorizeUrlPreview).toBe('')
            expect(response.body.warnings).toContain('CLIENT_ID not configured')
            expect(response.body.warnings).toContain(
                'WEBAPP_SESSION_SECRET not configured',
            )
            expect(response.body.warnings).toContain(
                'Redis is not healthy for shared services',
            )
        })

        test('should return degraded when redirect origin does not match configured frontend origins', async () => {
            mockRedis.isHealthy.mockReturnValue(true)
            process.env.WEBAPP_REDIRECT_URI =
                'https://other.lucassantana.tech/api/auth/callback'

            const response = await request(app)
                .get('/api/health/auth-config')
                .expect(200)

            expect(response.body.status).toBe('degraded')
            expect(response.body.warnings).toContain(
                'OAuth redirect origin is not in WEBAPP_FRONTEND_URL or WEBAPP_BACKEND_URL',
            )
        })

        test('should return degraded when CLIENT_ID differs from expected app id', async () => {
            mockRedis.isHealthy.mockReturnValue(true)
            process.env.CLIENT_ID = 'different-client-id'
            process.env.WEBAPP_EXPECTED_CLIENT_ID = 'expected-client-id'

            const response = await request(app)
                .get('/api/health/auth-config')
                .expect(200)

            expect(response.body.status).toBe('degraded')
            expect(response.body.warnings).toContain(
                'CLIENT_ID does not match expected production app id (expected-client-id)',
            )
        })

        test('should keep api-host callback when backend origin is configured in redirect uri', async () => {
            mockRedis.isHealthy.mockReturnValue(true)
            process.env.NODE_ENV = 'production'
            delete process.env.WEBAPP_BACKEND_URL
            process.env.WEBAPP_EXPECTED_CLIENT_ID = 'test-client-id'
            process.env.WEBAPP_REDIRECT_URI =
                'https://lucky-api.lucassantana.tech/api/auth/callback'

            const response = await request(app)
                .get('/api/health/auth-config')
                .set('x-forwarded-proto', 'https')
                .set('x-forwarded-host', 'lucky-api.lucassantana.tech')
                .set('Host', 'lucky-api.lucassantana.tech')
                .expect(200)

            expect(response.body.warnings).toEqual([])
            expect(response.body.status).toBe('ok')
            expect(response.body.auth.redirectUri).toBe(
                'https://lucky-api.lucassantana.tech/api/auth/callback',
            )
        })
    })

    describe('health route origin helpers', () => {
        test('reads first value from array-based forwarded headers', () => {
            const req = {
                headers: {
                    'x-forwarded-host': ['api.example.com', 'fallback.example.com'],
                },
            } as any

            expect(getForwardedHeader(req, 'x-forwarded-host')).toBe(
                'api.example.com',
            )
        })

        test('returns undefined when request host is unavailable', () => {
            const req = {
                headers: {},
                protocol: 'https',
                get: jest.fn((_header: string) => undefined),
            } as any

            expect(resolveRequestOrigin(req)).toBeUndefined()
        })

        test('returns undefined for malformed forwarded host values', () => {
            const req = {
                headers: {
                    'x-forwarded-host': 'bad host',
                    'x-forwarded-proto': 'https',
                },
                protocol: 'https',
                get: jest.fn((header: string) => {
                    if (header === 'x-forwarded-host') return 'bad host'
                    if (header === 'x-forwarded-proto') return 'https'
                    if (header === 'host') return undefined
                    return undefined
                }),
            } as any

            expect(resolveRequestOrigin(req)).toBeUndefined()
        })
    })
})
