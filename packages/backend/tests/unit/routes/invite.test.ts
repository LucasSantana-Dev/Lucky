import {
    describe,
    test,
    expect,
    jest,
    beforeEach,
    afterAll,
} from '@jest/globals'
import express from 'express'
import request from 'supertest'
import { BOT_INVITE_PERMISSIONS } from '@lucky/shared/constants'

const mockInfoLog = jest.fn()
const mockLogAndSwallow = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    infoLog: (...args: unknown[]) => mockInfoLog(...args),
}))

jest.mock('@lucky/shared/utils/error', () => ({
    logAndSwallow: (...args: unknown[]) => mockLogAndSwallow(...args),
}))

jest.mock('../../../src/middleware/rateLimit', () => ({
    apiLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

const CALLBACK_URI = 'https://lucky.test/api/auth/callback'
const prevEnv = process.env.WEBAPP_REDIRECT_URI
afterAll(() => {
    if (prevEnv === undefined) delete process.env.WEBAPP_REDIRECT_URI
    else process.env.WEBAPP_REDIRECT_URI = prevEnv
})

import { setupInviteRoute } from '../../../src/routes/invite'

function buildApp() {
    const app = express()
    setupInviteRoute(app)
    return app
}

describe('GET /invite', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockInfoLog.mockReset()
        process.env.WEBAPP_REDIRECT_URI = CALLBACK_URI
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
        const logged = (
            mockInfoLog.mock.calls[0] as [{ data: { utm_source: unknown } }]
        )[0]
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

    test('maps a known utm_source to state=src.<source> with OAuth flow', async () => {
        const res = await request(buildApp()).get('/invite?utm_source=topgg')
        expect(res.status).toBe(302)
        const url = new URL(res.headers.location)
        expect(url.origin + url.pathname).toBe(
            'https://discord.com/oauth2/authorize',
        )
        expect(url.searchParams.get('state')).toBe('src.topgg')
        expect(url.searchParams.get('response_type')).toBe('code')
        expect(url.searchParams.get('permissions')).toBe(BOT_INVITE_PERMISSIONS)
        expect(url.searchParams.get('redirect_uri')).toBe(CALLBACK_URI)
    })

    test('maps discordbotlist source to state=src.discordbotlist', async () => {
        const res = await request(buildApp()).get(
            '/invite?utm_source=discordbotlist',
        )
        const url = new URL(res.headers.location)
        expect(url.searchParams.get('state')).toBe('src.discordbotlist')
    })

    test('unknown utm_source keeps the plain invite URL (no state)', async () => {
        const res = await request(buildApp()).get('/invite?utm_source=reddit')
        expect(res.status).toBe(302)
        const url = new URL(res.headers.location)
        expect(url.searchParams.has('state')).toBe(false)
        expect(url.searchParams.has('response_type')).toBe(false)
    })

    test('no utm_source keeps the plain invite URL', async () => {
        const res = await request(buildApp()).get('/invite')
        const url = new URL(res.headers.location)
        expect(url.searchParams.has('state')).toBe(false)
    })
})
