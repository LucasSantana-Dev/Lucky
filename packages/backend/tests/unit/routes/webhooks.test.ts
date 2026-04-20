import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import express from 'express'
import request from 'supertest'

// Mock ioredis so the route never opens a real connection.
const pipelineExec = jest.fn<() => Promise<unknown>>().mockResolvedValue([])
const pipelineMock = {
    set: jest.fn().mockReturnThis(),
    incr: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    get: jest.fn().mockReturnThis(),
    ttl: jest.fn().mockReturnThis(),
    exec: pipelineExec,
}

jest.mock('ioredis', () => {
    return jest.fn().mockImplementation(() => ({
        pipeline: () => pipelineMock,
    }))
})

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
    process.env.REDIS_HOST = 'localhost'
    process.env.REDIS_PORT = '6379'
    pipelineExec.mockClear().mockResolvedValue([])
    pipelineMock.set.mockClear()
    pipelineMock.incr.mockClear()
    pipelineMock.expire.mockClear()
    pipelineMock.get.mockClear()
    pipelineMock.ttl.mockClear()
})

afterEach(() => {
    delete process.env.TOPGG_AUTH_TOKEN
    delete process.env.LUCKY_NOTIFY_API_KEY
    delete process.env.REDIS_HOST
    delete process.env.REDIS_PORT
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

    it('accepts test-type payload and returns { ok, test }', async () => {
        const res = await request(buildApp())
            .post('/webhooks/topgg-votes')
            .set('authorization', 'valid-token')
            .send({ type: 'test' })
        expect(res.status).toBe(200)
        expect(res.body).toEqual({ ok: true, test: true })
        expect(pipelineExec).not.toHaveBeenCalled()
    })

    it('rejects when user id is missing', async () => {
        const res = await request(buildApp())
            .post('/webhooks/topgg-votes')
            .set('authorization', 'valid-token')
            .send({ type: 'upvote' })
        expect(res.status).toBe(400)
    })

    it('responds to GET /api/internal/votes/:userId with current state', async () => {
        pipelineExec.mockResolvedValueOnce([
            [null, '1700000000000'],
            [null, '7'],
            [null, 3600],
        ])
        const res = await request(buildApp())
            .get('/api/internal/votes/123')
            .set('x-notify-key', 'internal-key')
        expect(res.status).toBe(200)
        expect(res.body).toEqual({
            hasVoted: true,
            streak: 7,
            nextVoteInSeconds: 3600,
        })
    })

    it('rejects GET with wrong internal key', async () => {
        const res = await request(buildApp())
            .get('/api/internal/votes/123')
            .set('x-notify-key', 'wrong')
        expect(res.status).toBe(401)
    })

    it('rejects GET with non-numeric userId', async () => {
        const res = await request(buildApp())
            .get('/api/internal/votes/abc')
            .set('x-notify-key', 'internal-key')
        expect(res.status).toBe(400)
    })

    describe('GET /api/me/vote-status', () => {
        it('returns 401 when not authenticated', async () => {
            const res = await request(buildApp()).get('/api/me/vote-status')
            expect(res.status).toBe(401)
        })

        it('returns state + tier + nextTier + voteUrl for a streak-14 voter', async () => {
            pipelineExec.mockResolvedValueOnce([
                [null, '1700000000000'],
                [null, '14'],
                [null, 7200],
            ])
            const res = await request(buildApp())
                .get('/api/me/vote-status')
                .set('x-test-user', '555')
            expect(res.status).toBe(200)
            expect(res.body).toEqual({
                hasVoted: true,
                streak: 14,
                nextVoteInSeconds: 7200,
                tier: { label: 'Lucky Regular', threshold: 14 },
                nextTier: { label: 'Lucky Legend', threshold: 30 },
                voteUrl: 'https://top.gg/bot/962198089161134131/vote',
            })
        })

        it('returns tier=null for a 0-streak user', async () => {
            pipelineExec.mockResolvedValueOnce([
                [null, null],
                [null, null],
                [null, -2],
            ])
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
            pipelineExec.mockResolvedValueOnce([
                [null, '1700000000000'],
                [null, '45'],
                [null, 100],
            ])
            const res = await request(buildApp())
                .get('/api/me/vote-status')
                .set('x-test-user', '999')
            expect(res.status).toBe(200)
            expect(res.body.tier.label).toBe('Lucky Legend')
            expect(res.body.nextTier).toBeNull()
        })
    })

    it('records a valid upvote in redis via pipeline', async () => {
        const res = await request(buildApp())
            .post('/webhooks/topgg-votes')
            .set('authorization', 'valid-token')
            .send({ user: '123', type: 'upvote', bot: '962198089161134131' })
        expect(res.status).toBe(200)
        expect(res.body).toEqual({ ok: true })
        expect(pipelineMock.set).toHaveBeenCalledWith(
            'votes:123',
            expect.any(String),
            'EX',
            60 * 60 * 12,
        )
        expect(pipelineMock.incr).toHaveBeenCalledWith('votes:streak:123')
        expect(pipelineMock.expire).toHaveBeenCalledWith(
            'votes:streak:123',
            60 * 60 * 36,
        )
        expect(pipelineExec).toHaveBeenCalledTimes(1)
    })
})
