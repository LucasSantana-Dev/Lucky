import { describe, test, expect, beforeAll } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import type { Response as SupertestResponse } from 'supertest'
import { setupMiddleware } from '../../../src/middleware'

describe('security headers via helmet (#1283)', () => {
    let res: SupertestResponse

    beforeAll(async () => {
        const app = express()
        setupMiddleware(app)
        app.get('/probe', (_req, response) => {
            response.json({ ok: true })
        })

        res = await request(app).get('/probe').expect(200)
    })

    test('sets X-Frame-Options DENY', () => {
        expect(res.headers['x-frame-options']).toBe('DENY')
    })

    test('sets X-Content-Type-Options nosniff', () => {
        expect(res.headers['x-content-type-options']).toBe('nosniff')
    })

    test('sets Referrer-Policy strict-origin-when-cross-origin', () => {
        expect(res.headers['referrer-policy']).toBe(
            'strict-origin-when-cross-origin',
        )
    })

    test('sets cross-origin CORP so the web origin can embed API images', () => {
        expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin')
    })

    test('does NOT set HSTS — TLS terminates at the Cloudflare Tunnel', () => {
        expect(res.headers['strict-transport-security']).toBeUndefined()
    })

    test('enforces the CSP with the shared template after the report-only window', () => {
        expect(
            res.headers['content-security-policy-report-only'],
        ).toBeUndefined()

        const csp = res.headers['content-security-policy']
        expect(csp).toBeDefined()
        expect(csp).toContain("default-src 'self'")
        expect(csp).toContain("frame-ancestors 'none'")
        expect(csp).toContain("object-src 'none'")
        expect(csp).toContain('https://cdn.discordapp.com')
        expect(csp).toContain('https://*.sentry.io')
        expect(csp).toContain('report-uri /api/security/csp-report')
    })
})
