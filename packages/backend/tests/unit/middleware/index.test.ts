import { describe, test, expect } from '@jest/globals'
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
        expect(res.headers['access-control-allow-origin']).toBeUndefined()
    })
})
