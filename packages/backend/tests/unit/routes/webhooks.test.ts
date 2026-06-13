import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals'
import express from 'express'
import request from 'supertest'

// Mock chalk to avoid "color is not a function" in LogService
jest.mock('chalk', () => ({
    red: (str: string) => str,
    yellow: (str: string) => str,
    blue: (str: string) => str,
    green: (str: string) => str,
    gray: (str: string) => str,
}))

// Mock auth middleware to inject a configurable user. The actual middleware
// reads from session; for unit tests we short-circuit with a header.
jest.mock('../../../src/middleware/auth', () => ({
    requireAuth: (
        req: { header: (n: string) => string | undefined; user?: unknown },
        res: { status: (n: number) => { json: (b: unknown) => void } },
        next: () => void,
    ) => {
        const testUser = req.header('x-test-user')
        if (!testUser) {
            return res.status(401).json({ error: 'not authenticated' })
        }
        req.user = { id: testUser }
        next()
    },
}))

// Mock Prisma client via getPrismaClient so the route never opens a real database connection.
// This must be done before importing the route module.
const mockFindUnique = jest.fn()
const mockTransaction = jest.fn()

jest.mock('@lucky/shared/utils', () => {
    const actual = jest.requireActual('@lucky/shared/utils')
    return {
        ...actual,
        getPrismaClient: jest.fn(() => ({
            topggVote: {
                findUnique: mockFindUnique,
            },
            $transaction: mockTransaction,
        })),
    }
}, { virtual: true })

import { setupWebhookRoutes } from '../../../src/routes/webhooks'

function buildApp(): express.Express {
    const app = express()
    app.use(express.json())
    setupWebhookRoutes(app)
    app.use(
        (
            err: { statusCode?: number; message?: string },
            _req: express.Request,
            res: express.Response,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            _next: express.NextFunction,
        ) => {
            res.status(err.statusCode ?? 500).json({
                error: err.message ?? 'unknown',
            })
        },
    )
    return app
}

beforeEach(() => {
    process.env.TOPGG_AUTH_TOKEN = 'valid-token'
    process.env.LUCKY_NOTIFY_API_KEY = 'internal-key'
    mockFindUnique.mockClear()
    mockTransaction.mockClear()
})

afterEach(() => {
    delete process.env.TOPGG_AUTH_TOKEN
    delete process.env.LUCKY_NOTIFY_API_KEY
})

describe('POST /webhooks/topgg-votes', () => {
    it('returns 503 when TOPGG_AUTH_TOKEN is unset', async () => {
        delete process.env.TOPGG_AUTH_TOKEN
        const res = await request(buildApp())
            .post('/webhooks/topgg-votes')
            .set('authorization', 'anything')
            .send({ user: '1', type: 'upvote' })
        expect(res.status).toBe(503)
    })

    it('rejects on missing authorization header', async () => {
        const res = await request(buildApp())
            .post('/webhooks/topgg-votes')
            .send({ user: '1', type: 'upvote' })
        expect(res.status).toBe(401)
    })

    it('rejects on wrong authorization header', async () => {
        const res = await request(buildApp())
            .post('/webhooks/topgg-votes')
            .set('authorization', 'wrong')
            .send({ user: '1', type: 'upvote' })
        expect(res.status).toBe(401)
    })

    it('rejects whitespace-only authorization header', async () => {
        const res = await request(buildApp())
            .post('/webhooks/topgg-votes')
            .set('authorization', '   ')
            .send({ user: '1', type: 'upvote' })
        expect(res.status).toBe(401)
    })

    it('accepts test-type payload and returns { ok, test }', async () => {
        const res = await request(buildApp())
            .post('/webhooks/topgg-votes')
            .set('authorization', 'valid-token')
            .send({ type: 'test' })
        expect(res.status).toBe(200)
        expect(res.body).toEqual({ ok: true, test: true })
        expect(mockTransaction).not.toHaveBeenCalled()
    })

    it('rejects when user id is missing', async () => {
        const res = await request(buildApp())
            .post('/webhooks/topgg-votes')
            .set('authorization', 'valid-token')
            .send({ type: 'upvote' })
        expect(res.status).toBe(400)
    })

    it('rejects unsupported vote type (not upvote/test)', async () => {
        const res = await request(buildApp())
            .post('/webhooks/topgg-votes')
            .set('authorization', 'valid-token')
            .send({ user: '1', type: 'downvote' })
        expect(res.status).toBe(400)
        expect(mockTransaction).not.toHaveBeenCalled()
    })
})

describe('GET /api/internal/votes/:userId', () => {
    it('responds to GET /api/internal/votes/:userId with current state', async () => {
        const now = Date.now()
        const lastVoteTime = new Date(now - 7200000) // 2 hours ago
        mockFindUnique.mockResolvedValueOnce({
            userId: '123456789012345678',
            lastVoteAt: lastVoteTime,
            streak: 7,
        })
        const res = await request(buildApp())
            .get('/api/internal/votes/123456789012345678')
            .set('x-notify-key', 'internal-key')
        expect(res.status).toBe(200)
        expect(res.body).toEqual({
            hasVoted: true,
            streak: 7,
            nextVoteInSeconds: expect.any(Number),
        })
        expect(res.body.nextVoteInSeconds).toBeGreaterThan(0)
        expect(res.body.nextVoteInSeconds).toBeLessThanOrEqual(43200) // 12h in seconds
    })

    it('rejects GET with wrong internal key', async () => {
        const res = await request(buildApp())
            .get('/api/internal/votes/123456789012345678')
            .set('x-notify-key', 'wrong')
        expect(res.status).toBe(401)
    })

    it('rejects GET with whitespace-only x-notify-key', async () => {
        const res = await request(buildApp())
            .get('/api/internal/votes/123456789012345678')
            .set('x-notify-key', '   ')
        expect(res.status).toBe(401)
    })

    it('rejects GET with non-numeric userId', async () => {
        const res = await request(buildApp())
            .get('/api/internal/votes/abc')
            .set('x-notify-key', 'internal-key')
        expect(res.status).toBe(400)
    })

    it('rejects GET with numeric non-snowflake userId', async () => {
        const res = await request(buildApp())
            .get('/api/internal/votes/123')
            .set('x-notify-key', 'internal-key')
        expect(res.status).toBe(400)
    })

    it('returns state with no votes when user not found', async () => {
        mockFindUnique.mockResolvedValueOnce(null)
        const res = await request(buildApp())
            .get('/api/internal/votes/123456789012345678')
            .set('x-notify-key', 'internal-key')
        expect(res.status).toBe(200)
        expect(res.body).toEqual({
            hasVoted: false,
            streak: 0,
            nextVoteInSeconds: 0,
        })
    })

    it('returns streak=0 when streak has expired (>36h stale)', async () => {
        const now = Date.now()
        const lastVoteTime = new Date(now - 129600001) // 36h + 1ms ago
        mockFindUnique.mockResolvedValueOnce({
            userId: '123456789012345678',
            lastVoteAt: lastVoteTime,
            streak: 7,
        })
        const res = await request(buildApp())
            .get('/api/internal/votes/123456789012345678')
            .set('x-notify-key', 'internal-key')
        expect(res.status).toBe(200)
        expect(res.body).toEqual({
            hasVoted: false,
            streak: 0,
            nextVoteInSeconds: 0,
        })
    })
})

describe('GET /api/me/vote-status', () => {
    it('returns 401 when not authenticated', async () => {
        const res = await request(buildApp()).get('/api/me/vote-status')
        expect(res.status).toBe(401)
    })

    it('returns state + tier + nextTier + voteUrl for a streak-14 voter', async () => {
        const now = Date.now()
        const lastVoteTime = new Date(now - 7200000) // 2 hours ago
        mockFindUnique.mockResolvedValueOnce({
            userId: '555',
            lastVoteAt: lastVoteTime,
            streak: 14,
        })
        const res = await request(buildApp())
            .get('/api/me/vote-status')
            .set('x-test-user', '555')
        expect(res.status).toBe(200)
        expect(res.body.hasVoted).toBe(true)
        expect(res.body.streak).toBe(14)
        expect(res.body.tier).toEqual({ label: 'Lucky Regular', threshold: 14 })
        expect(res.body.nextTier).toEqual({ label: 'Lucky Legend', threshold: 30 })
        expect(res.body.voteUrl).toBe('https://top.gg/bot/962198089161134131/vote')
    })

    it('returns tier=null for a 0-streak user', async () => {
        mockFindUnique.mockResolvedValueOnce(null)
        const res = await request(buildApp())
            .get('/api/me/vote-status')
            .set('x-test-user', '777')
        expect(res.status).toBe(200)
        expect(res.body.tier).toBeNull()
        expect(res.body.nextTier).toEqual({
            label: 'Lucky Supporter',
            threshold: 1,
        })
        expect(res.body.streak).toBe(0)
        expect(res.body.hasVoted).toBe(false)
    })

    it('returns nextTier=null when user is at max tier (30+)', async () => {
        const now = Date.now()
        const lastVoteTime = new Date(now - 36000000) // 10 hours ago
        mockFindUnique.mockResolvedValueOnce({
            userId: '999',
            lastVoteAt: lastVoteTime,
            streak: 45,
        })
        const res = await request(buildApp())
            .get('/api/me/vote-status')
            .set('x-test-user', '999')
        expect(res.status).toBe(200)
        expect(res.body.tier.label).toBe('Lucky Legend')
        expect(res.body.nextTier).toBeNull()
        expect(res.body.streak).toBe(45)
    })
})

describe('POST /webhooks/topgg-votes persistence', () => {
    it('records a valid upvote with Prisma transaction', async () => {
        // Mock the transaction callback to simulate recording a new vote
        const txUpsertCalls: unknown[] = []
        mockTransaction.mockImplementation(async (callback: Function) => {
            // The callback receives a tx object with topggVote operations
            const txMock = {
                topggVote: {
                    findUnique: jest.fn().mockResolvedValue(null), // No existing vote
                    upsert: jest.fn(async (arg) => {
                        txUpsertCalls.push(arg)
                        return {
                            id: 'vote-id',
                            userId: '123456789012345678',
                            lastVoteAt: new Date(),
                            streak: 1,
                        }
                    }),
                },
            }
            const result = await callback(txMock)
            return result
        })

        const res = await request(buildApp())
            .post('/webhooks/topgg-votes')
            .set('authorization', 'valid-token')
            .send({
                user: '123456789012345678',
                type: 'upvote',
                bot: '962198089161134131',
            })
        expect(res.status).toBe(200)
        expect(res.body).toEqual({ ok: true })
        expect(mockTransaction).toHaveBeenCalled()
        expect(txUpsertCalls).toHaveLength(1)
        expect(txUpsertCalls[0]).toEqual(
            expect.objectContaining({
                where: { userId: '123456789012345678' },
                create: expect.objectContaining({
                    userId: '123456789012345678',
                    streak: 1,
                }),
                update: expect.objectContaining({
                    streak: 1,
                }),
            }),
        )
    })

    it('returns duplicate=true on duplicate vote within 12h', async () => {
        const now = Date.now()
        const lastVoteTime = new Date(now - 3600000) // 1 hour ago, within 12h window
        const txUpsertCalls: unknown[] = []
        mockTransaction.mockImplementation(async (callback: Function) => {
            const txMock = {
                topggVote: {
                    findUnique: jest.fn().mockResolvedValue({
                        userId: '123456789012345678',
                        lastVoteAt: lastVoteTime,
                        streak: 5,
                    }),
                    upsert: jest.fn(async (arg) => {
                        txUpsertCalls.push(arg)
                        throw new Error('upsert should not be called on duplicate')
                    }),
                },
            }
            const result = await callback(txMock)
            return result
        })

        const res = await request(buildApp())
            .post('/webhooks/topgg-votes')
            .set('authorization', 'valid-token')
            .send({
                user: '123456789012345678',
                type: 'upvote',
                bot: '962198089161134131',
            })
        expect(res.status).toBe(200)
        expect(res.body).toEqual({ ok: true, duplicate: true })
        expect(mockTransaction).toHaveBeenCalled()
        expect(txUpsertCalls).toHaveLength(0)
    })

    it('increments streak when vote recorded after 12h but within 36h', async () => {
        const now = Date.now()
        const lastVoteTime = new Date(now - 86400000) // 24 hours ago, within 36h window
        let txMockUpsert: jest.Mock
        mockTransaction.mockImplementation(async (callback: Function) => {
            txMockUpsert = jest.fn().mockResolvedValue({
                userId: '123456789012345678',
                lastVoteAt: new Date(),
                streak: 6,
            })
            const txMock = {
                topggVote: {
                    findUnique: jest.fn().mockResolvedValue({
                        userId: '123456789012345678',
                        lastVoteAt: lastVoteTime,
                        streak: 5,
                    }),
                    upsert: txMockUpsert,
                },
            }
            const result = await callback(txMock)
            return result
        })

        const res = await request(buildApp())
            .post('/webhooks/topgg-votes')
            .set('authorization', 'valid-token')
            .send({
                user: '123456789012345678',
                type: 'upvote',
                bot: '962198089161134131',
            })
        expect(res.status).toBe(200)
        expect(res.body).toEqual({ ok: true })
        expect(mockTransaction).toHaveBeenCalled()
        expect(txMockUpsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { userId: '123456789012345678' },
                update: expect.objectContaining({
                    streak: 6,
                }),
            }),
        )
    })

    it('preserves streak at exactly 36h boundary', async () => {
        // Use fake timers to control time precisely
        const STREAK_TTL = 129600000 // 36 hours in milliseconds
        const baseTime = 1000000000 // arbitrary fixed time
        jest.useFakeTimers()
        jest.setSystemTime(baseTime)

        const lastVoteTime = new Date(baseTime - STREAK_TTL) // exactly 36h ago
        let txMockUpsert: jest.Mock
        mockTransaction.mockImplementation(async (callback: Function) => {
            txMockUpsert = jest.fn().mockResolvedValue({
                userId: '123456789012345678',
                lastVoteAt: new Date(),
                streak: 11,
            })
            const txMock = {
                topggVote: {
                    findUnique: jest.fn().mockResolvedValue({
                        userId: '123456789012345678',
                        lastVoteAt: lastVoteTime,
                        streak: 10,
                    }),
                    upsert: txMockUpsert,
                },
            }
            const result = await callback(txMock)
            return result
        })

        const res = await request(buildApp())
            .post('/webhooks/topgg-votes')
            .set('authorization', 'valid-token')
            .send({
                user: '123456789012345678',
                type: 'upvote',
                bot: '962198089161134131',
            })
        expect(res.status).toBe(200)
        expect(res.body).toEqual({ ok: true })
        expect(mockTransaction).toHaveBeenCalled()
        expect(txMockUpsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { userId: '123456789012345678' },
                update: expect.objectContaining({
                    streak: 11,
                }),
            }),
        )

        jest.useRealTimers()
    })

    it('resets streak when vote recorded after 36h', async () => {
        // Use fake timers to control time precisely
        const STREAK_TTL = 129600000 // 36 hours in milliseconds
        const baseTime = 1000000000 // arbitrary fixed time
        jest.useFakeTimers()
        jest.setSystemTime(baseTime)

        const lastVoteTime = new Date(baseTime - STREAK_TTL - 1) // 36h + 1ms ago, beyond window
        let txMockUpsert: jest.Mock
        mockTransaction.mockImplementation(async (callback: Function) => {
            txMockUpsert = jest.fn().mockResolvedValue({
                userId: '123456789012345678',
                lastVoteAt: new Date(),
                streak: 1,
            })
            const txMock = {
                topggVote: {
                    findUnique: jest.fn().mockResolvedValue({
                        userId: '123456789012345678',
                        lastVoteAt: lastVoteTime,
                        streak: 10,
                    }),
                    upsert: txMockUpsert,
                },
            }
            const result = await callback(txMock)
            return result
        })

        const res = await request(buildApp())
            .post('/webhooks/topgg-votes')
            .set('authorization', 'valid-token')
            .send({
                user: '123456789012345678',
                type: 'upvote',
                bot: '962198089161134131',
            })
        expect(res.status).toBe(200)
        expect(res.body).toEqual({ ok: true })
        expect(mockTransaction).toHaveBeenCalled()
        expect(txMockUpsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { userId: '123456789012345678' },
                update: expect.objectContaining({
                    streak: 1,
                }),
            }),
        )

        jest.useRealTimers()
    })

    it('rejects unsafe non-snowflake user ids before writing to database', async () => {
        const res = await request(buildApp())
            .post('/webhooks/topgg-votes')
            .set('authorization', 'valid-token')
            .send({ user: 'streak:123', type: 'upvote' })
        expect(res.status).toBe(400)
        expect(mockTransaction).not.toHaveBeenCalled()
    })
})
