import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from '@jest/globals'
import express from 'express'
import request from 'supertest'

import { setupBillingRoutes } from '../../../src/routes/billing'

function buildApp(): express.Express {
    const app = express()
    app.use(express.json())
    setupBillingRoutes(app)
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
    delete process.env.STRIPE_ENABLED
})

afterEach(() => {
    delete process.env.STRIPE_ENABLED
})

describe('billing routes — disabled by default', () => {
    it('GET /api/billing/status returns 503 when STRIPE_ENABLED unset', async () => {
        const res = await request(buildApp()).get('/api/billing/status')
        expect(res.status).toBe(503)
    })

    it('POST /api/billing/checkout returns 503 when STRIPE_ENABLED unset', async () => {
        const res = await request(buildApp())
            .post('/api/billing/checkout')
            .send({})
        expect(res.status).toBe(503)
    })

    it('POST /api/billing/portal returns 503 when STRIPE_ENABLED unset', async () => {
        const res = await request(buildApp())
            .post('/api/billing/portal')
            .send({})
        expect(res.status).toBe(503)
    })

    it('DELETE /api/billing/subscription returns 503 when STRIPE_ENABLED unset', async () => {
        const res = await request(buildApp()).delete(
            '/api/billing/subscription',
        )
        expect(res.status).toBe(503)
    })

    it('STRIPE_ENABLED=false (explicit) still returns 503', async () => {
        process.env.STRIPE_ENABLED = 'false'
        const res = await request(buildApp()).get('/api/billing/status')
        expect(res.status).toBe(503)
    })
})

describe('billing routes — proves flag is actually read', () => {
    it('GET /api/billing/status returns 501 when STRIPE_ENABLED=true', async () => {
        process.env.STRIPE_ENABLED = 'true'
        const res = await request(buildApp()).get('/api/billing/status')
        expect(res.status).toBe(501)
    })
})
