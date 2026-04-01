import {
    describe,
    test,
    expect,
    jest,
    beforeEach,
    afterEach,
} from '@jest/globals'
import type { Request, Response, NextFunction } from 'express'

// Mock shared services before import
jest.mock('@lucky/shared/services', () => ({
    twitchNotificationService: {
        listByGuild: jest.fn(),
        add: jest.fn(),
        remove: jest.fn(),
    },
}))

// Mock auth middleware
jest.mock('../../../src/middleware/auth', () => ({
    requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
}))

// Mock rate limiter
jest.mock('../../../src/middleware/rateLimit', () => ({
    writeLimiter: (_req: Request, _res: Response, next: NextFunction) => next(),
}))

// Mock validate middleware
jest.mock('../../../src/middleware/validate', () => ({
    validateBody: () => (_req: Request, _res: Response, next: NextFunction) =>
        next(),
    validateParams: () => (_req: Request, _res: Response, next: NextFunction) =>
        next(),
}))

import express from 'express'
import request from 'supertest'
import { setupTwitchRoutes } from '../../../src/routes/twitch'

function createApp() {
    const app = express()
    app.use(express.json())
    setupTwitchRoutes(app)
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

const MOCK_USER = { id: '12345', login: 'testuser', display_name: 'TestUser' }

describe('GET /api/twitch/users', () => {
    const originalEnv = process.env

    beforeEach(() => {
        jest.clearAllMocks()
        process.env = { ...originalEnv }
        global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>
    })

    afterEach(() => {
        process.env = originalEnv
    })

    test('returns 400 when login query param is missing', async () => {
        delete process.env.TWITCH_CLIENT_ID
        const app = createApp()
        const res = await request(app).get('/api/twitch/users')
        expect(res.status).toBe(400)
        expect(res.body.error).toMatch(/login query parameter required/)
    })

    test('returns 503 when TWITCH_CLIENT_ID is not set', async () => {
        delete process.env.TWITCH_CLIENT_ID
        delete process.env.TWITCH_CLIENT_SECRET
        delete process.env.TWITCH_ACCESS_TOKEN
        const app = createApp()
        const res = await request(app).get('/api/twitch/users?login=testuser')
        expect(res.status).toBe(503)
        expect(res.body.error).toMatch(/not configured/)
    })

    test('returns 503 when no access token and no client secret', async () => {
        process.env.TWITCH_CLIENT_ID = 'test-client-id'
        delete process.env.TWITCH_CLIENT_SECRET
        delete process.env.TWITCH_ACCESS_TOKEN
        const app = createApp()
        const res = await request(app).get('/api/twitch/users?login=testuser')
        expect(res.status).toBe(503)
        expect(res.body.error).toMatch(/not configured/)
    })

    test('returns 404 when user not found', async () => {
        process.env.TWITCH_CLIENT_ID = 'test-client-id'
        process.env.TWITCH_ACCESS_TOKEN = 'test-token'
        ;(global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ data: [] }),
        } as Response)
        const app = createApp()
        const res = await request(app).get('/api/twitch/users?login=nobody')
        expect(res.status).toBe(404)
        expect(res.body.error).toMatch(/not found/)
    })

    test('returns user data on success', async () => {
        process.env.TWITCH_CLIENT_ID = 'test-client-id'
        process.env.TWITCH_ACCESS_TOKEN = 'test-token'
        ;(global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ data: [MOCK_USER] }),
        } as Response)
        const app = createApp()
        const res = await request(app).get('/api/twitch/users?login=testuser')
        expect(res.status).toBe(200)
        expect(res.body).toEqual({
            id: MOCK_USER.id,
            login: MOCK_USER.login,
            displayName: MOCK_USER.display_name,
        })
    })

    test('refreshes app token on 401 and retries', async () => {
        process.env.TWITCH_CLIENT_ID = 'test-client-id'
        process.env.TWITCH_CLIENT_SECRET = 'test-secret'
        process.env.TWITCH_ACCESS_TOKEN = 'expired-token'
        const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
        mockFetch
            .mockResolvedValueOnce({ ok: false, status: 401 } as Response)
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    access_token: 'new-token',
                    expires_in: 3600,
                }),
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ data: [MOCK_USER] }),
            } as Response)
        const app = createApp()
        const res = await request(app).get('/api/twitch/users?login=testuser')
        expect(res.status).toBe(200)
        expect(res.body.login).toBe(MOCK_USER.login)
    })
})
