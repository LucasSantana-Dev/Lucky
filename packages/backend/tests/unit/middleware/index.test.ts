import { describe, test, expect, jest } from '@jest/globals'
import express from 'express'
import request from 'supertest'
import { errorHandler } from '../../../src/middleware/errorHandler'
import { setupMiddleware } from '../../../src/middleware'

describe('Middleware setup', () => {
    test('should enable trust proxy in production', () => {
        const originalNodeEnv = process.env.NODE_ENV
        process.env.NODE_ENV = 'production'
        const app = express()

        setupMiddleware(app)

        expect(app.get('trust proxy')).toBe(1)
        process.env.NODE_ENV = originalNodeEnv
    })

    test('should not force trust proxy outside production', () => {
        const originalNodeEnv = process.env.NODE_ENV
        process.env.NODE_ENV = 'test'
        const app = express()

        setupMiddleware(app)

        expect(app.get('trust proxy')).not.toBe(1)
        process.env.NODE_ENV = originalNodeEnv
    })

    test('should answer 403 (not 500) for a rejected CORS origin', async () => {
        const app = express()
        setupMiddleware(app)
        app.get('/ping', (_req, res) => {
            res.json({ ok: true })
        })
        app.use(errorHandler)

        const res = await request(app)
            .get('/ping')
            .set('Origin', 'https://evil.example')

        expect(res.status).toBe(403)
        expect(res.body.error).toBe('Not allowed by CORS')
        expect(res.headers['access-control-allow-origin']).toBeUndefined()
    })

    test('rejects a cross-site form POST before it reaches a route', async () => {
        const app = express()
        setupMiddleware(app)
        const handler = jest.fn(
            (_req: express.Request, res: express.Response) => {
                res.json({ ok: true })
            },
        )
        app.post('/settings', handler)
        app.use(errorHandler)

        const res = await request(app)
            .post('/settings')
            .set('Origin', 'https://evil.example')
            .type('form')
            .send('prefix=pwned')

        expect(res.status).toBe(403)
        expect(handler).not.toHaveBeenCalled()
    })

    test('does not parse form-encoded bodies (the API only takes JSON)', async () => {
        const app = express()
        setupMiddleware(app)
        app.post('/echo', (req, res) => {
            res.json({ body: req.body ?? null })
        })
        app.use(errorHandler)

        const res = await request(app)
            .post('/echo')
            .type('form')
            .send('prefix=pwned')

        expect(res.status).toBe(200)
        expect(res.body.body?.prefix).toBeUndefined()
    })

    test('should answer 403 for a rejected CORS preflight', async () => {
        const app = express()
        setupMiddleware(app)
        app.use(errorHandler)

        const res = await request(app)
            .options('/ping')
            .set('Origin', 'https://evil.example')
            .set('Access-Control-Request-Method', 'GET')

        expect(res.status).toBe(403)
        expect(res.headers['access-control-allow-origin']).toBeUndefined()
    })
})
