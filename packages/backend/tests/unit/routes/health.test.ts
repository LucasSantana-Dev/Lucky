import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import express from 'express'
import request from 'supertest'

jest.mock('@lucky/shared/services', () => ({
    redisClient: {
        isHealthy: jest.fn().mockReturnValue(true),
        getMetrics: jest
            .fn()
            .mockReturnValue({ hitRate: 0.9, hits: 9, misses: 1 }),
    },
}))

jest.mock('../../../src/utils/frontendOrigin', () => ({
    getFrontendOrigins: jest.fn().mockReturnValue([]),
}))

jest.mock('../../../src/utils/oauthRedirectUri', () => ({
    getOAuthRedirectUri: jest
        .fn()
        .mockReturnValue('http://localhost/api/auth/callback'),
}))

jest.mock('../../../src/utils/authHealth', () => ({
    buildAuthConfigHealth: jest.fn().mockReturnValue({ status: 'ok' }),
}))

import { setupHealthRoutes } from '../../../src/routes/health'

function buildApp() {
    const app = express()
    setupHealthRoutes(app)
    return app
}

describe('GET /api/health/version', () => {
    const originalEnv = process.env

    beforeEach(() => {
        process.env = { ...originalEnv }
    })

    afterEach(() => {
        process.env = originalEnv
    })

    test('returns commitSha and version from env vars', async () => {
        process.env.COMMIT_SHA = 'abc123def456'
        process.env.npm_package_version = '2.6.60'

        const res = await request(buildApp()).get('/api/health/version')

        expect(res.status).toBe(200)
        expect(res.body).toEqual({
            commitSha: 'abc123def456',
            version: '2.6.60',
        })
    })

    test('returns null for missing env vars', async () => {
        delete process.env.COMMIT_SHA
        delete process.env.npm_package_version

        const res = await request(buildApp()).get('/api/health/version')

        expect(res.status).toBe(200)
        expect(res.body).toEqual({ commitSha: null, version: null })
    })

    test('returns commitSha null when only version is set', async () => {
        delete process.env.COMMIT_SHA
        process.env.npm_package_version = '1.0.0'

        const res = await request(buildApp()).get('/api/health/version')

        expect(res.status).toBe(200)
        expect(res.body.commitSha).toBeNull()
        expect(res.body.version).toBe('1.0.0')
    })

    test('falls back to short commit label when npm_package_version is unset', async () => {
        process.env.COMMIT_SHA = 'abc123def456'
        delete process.env.npm_package_version

        const res = await request(buildApp()).get('/api/health/version')

        expect(res.status).toBe(200)
        expect(res.body).toEqual({
            commitSha: 'abc123def456',
            version: 'commit abc123d',
        })
    })
})
