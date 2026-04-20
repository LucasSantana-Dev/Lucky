import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import express from 'express'
import request from 'supertest'

// Mock ioredis so the route never opens a real connection.
const pipelineExec = jest.fn<() => Promise<unknown>>().mockResolvedValue([])
const pipelineMock = {
    set: jest.fn().mockReturnThis(),
    incr: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    exec: pipelineExec,
}

jest.mock('ioredis', () => {
    return jest.fn().mockImplementation(() => ({
        pipeline: () => pipelineMock,
    }))
})

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
    process.env.REDIS_HOST = 'localhost'
    process.env.REDIS_PORT = '6379'
    pipelineExec.mockClear()
    pipelineMock.set.mockClear()
    pipelineMock.incr.mockClear()
    pipelineMock.expire.mockClear()
})

afterEach(() => {
    delete process.env.TOPGG_AUTH_TOKEN
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
