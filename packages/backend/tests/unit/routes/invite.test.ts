import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import express from 'express'
import request from 'supertest'

const mockInfoLog = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    infoLog: (...args: unknown[]) => mockInfoLog(...args),
}))

jest.mock('../../../src/middleware/rateLimit', () => ({
    apiLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

import { setupInviteRoute } from '../../../src/routes/invite'

function buildApp() {
    const app = express()
    setupInviteRoute(app)
    return app
}

describe('GET /invite', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('redirects to Discord invite URL', async () => {
        const res = await request(buildApp()).get('/invite')
        expect(res.status).toBe(302)
        expect(res.headers.location).toContain('discord.com/oauth2/authorize')
    })

    test('logs UTM params when present', async () => {
        await request(buildApp()).get(
            '/invite?utm_source=github&utm_medium=readme&utm_campaign=test&utm_content=badge',
        )
        expect(mockInfoLog).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    utm_source: 'github',
                    utm_medium: 'readme',
                    utm_campaign: 'test',
                    utm_content: 'badge',
                }),
            }),
        )
    })

    test('logs undefined for missing UTM params', async () => {
        await request(buildApp()).get('/invite')
        expect(mockInfoLog).toHaveBeenCalledWith(
            expect.objectContaining({
                data: {
                    utm_source: undefined,
                    utm_medium: undefined,
                    utm_campaign: undefined,
                    utm_content: undefined,
                },
            }),
        )
    })

    test('coerces array UTM values to undefined', async () => {
        await request(buildApp()).get('/invite?utm_source=a&utm_source=b')
        const logged = (mockInfoLog.mock.calls[0] as [{ data: { utm_source: unknown } }])[0]
        expect(logged.data.utm_source).toBeUndefined()
    })

    test('still redirects when infoLog throws', async () => {
        mockInfoLog.mockImplementation(() => {
            throw new Error('logging failure')
        })
        const res = await request(buildApp()).get('/invite')
        expect(res.status).toBe(302)
        expect(res.headers.location).toContain('discord.com')
    })

    test('never redirects to a user-supplied URL (no open redirect)', async () => {
        const res = await request(buildApp()).get(
            '/invite?redirect=https://evil.example.com',
        )
        expect(res.headers.location).not.toContain('evil.example.com')
        expect(res.headers.location).toContain('discord.com')
    })
})
