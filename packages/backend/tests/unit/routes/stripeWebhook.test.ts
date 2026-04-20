import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from '@jest/globals'
import express from 'express'
import request from 'supertest'

import { setupStripeWebhookRoutes } from '../../../src/routes/stripeWebhook'

function buildApp(): express.Express {
    const app = express()
    app.use(express.json())
    setupStripeWebhookRoutes(app)
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

describe('POST /webhooks/stripe', () => {
    it('returns 503 when STRIPE_ENABLED unset', async () => {
        const res = await request(buildApp())
            .post('/webhooks/stripe')
            .send({})
        expect(res.status).toBe(503)
    })

    it('returns 501 when STRIPE_ENABLED=true', async () => {
        process.env.STRIPE_ENABLED = 'true'
        const res = await request(buildApp())
            .post('/webhooks/stripe')
            .send({})
        expect(res.status).toBe(501)
    })
})
