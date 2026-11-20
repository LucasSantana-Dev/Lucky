import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import express from 'express'
import request from 'supertest'

const mockInfoLog = jest.fn()
const mockLogAndSwallow = jest.fn()
const mockInviteClickCreate = jest.fn<(arg: unknown) => Promise<unknown>>()
const mockGetPrismaClient = jest.fn(() => ({
    inviteClick: { create: mockInviteClickCreate },
}))

jest.mock('@lucky/shared/utils', () => ({
    infoLog: (...args: unknown[]) => mockInfoLog(...args),
    getPrismaClient: () => mockGetPrismaClient(),
}))

jest.mock('@lucky/shared/utils/error', () => ({
    logAndSwallow: (...args: unknown[]) => mockLogAndSwallow(...args),
}))

jest.mock('../../../src/middleware/rateLimit', () => ({
    apiLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

import { setupInviteRoute, referrerHostOf } from '../../../src/routes/invite'

function buildApp() {
    const app = express()
    setupInviteRoute(app)
    return app
}

describe('GET /invite', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockInfoLog.mockReset()
        mockInviteClickCreate.mockReset()
        mockInviteClickCreate.mockResolvedValue({})
        mockGetPrismaClient.mockImplementation(() => ({
            inviteClick: { create: mockInviteClickCreate },
        }))
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

    test('keeps the first value of a repeated UTM key', async () => {
        await request(buildApp()).get('/invite?utm_source=a&utm_source=b')
        const logged = (
            mockInfoLog.mock.calls[0] as [{ data: { utm_source: unknown } }]
        )[0]
        expect(logged.data.utm_source).toBe('a')
    })

    // Prod 2026-11-13: the discordbotlist page links the listing invite plus
    // its own `&utm_source=discordbotlist.com&utm_medium=bot_page`.
    test('attributes a discordbotlist link that repeats utm_source', async () => {
        const res = await request(buildApp()).get(
            '/invite?utm_source=discordbotlist&utm_medium=directory&utm_campaign=bot-listing&utm_source=discordbotlist.com&utm_medium=bot_page',
        )
        const location = new URL(res.headers.location)
        expect(location.searchParams.get('state')).toBe('src.discordbotlist')
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

    test('carries the utm_source through the OAuth state', async () => {
        const res = await request(buildApp()).get(
            '/invite?utm_source=discordbotsgg&utm_medium=directory',
        )
        const location = new URL(res.headers.location)
        expect(location.searchParams.get('state')).toBe('src.botsgg')
        expect(location.searchParams.get('response_type')).toBe('code')
        expect(location.searchParams.get('redirect_uri')).toContain(
            '/api/auth/callback',
        )
    })

    test('stores sources off the allowlist as unknown', async () => {
        const res = await request(buildApp()).get('/invite?utm_source=<script>')
        const location = new URL(res.headers.location)
        expect(location.searchParams.get('state')).toBe('src.unknown')
    })

    describe('invite_clicks (#2395)', () => {
        test('records the UTM fields and the referrer host', async () => {
            await request(buildApp())
                .get(
                    '/invite?utm_source=topgg&utm_medium=directory&utm_campaign=listing&utm_content=button',
                )
                .set('Referer', 'https://top.gg/bot/123?ref=abc')
            expect(mockInviteClickCreate).toHaveBeenCalledWith({
                data: {
                    utmSource: 'topgg',
                    utmMedium: 'directory',
                    utmCampaign: 'listing',
                    utmContent: 'button',
                    referrerHost: 'top.gg',
                },
            })
        })

        test('stores nulls when nothing is known', async () => {
            await request(buildApp()).get('/invite')
            expect(mockInviteClickCreate).toHaveBeenCalledWith({
                data: {
                    utmSource: null,
                    utmMedium: null,
                    utmCampaign: null,
                    utmContent: null,
                    referrerHost: null,
                },
            })
        })

        test('caps long values at 100 characters', async () => {
            await request(buildApp()).get(
                `/invite?utm_campaign=${'x'.repeat(500)}`,
            )
            const arg = mockInviteClickCreate.mock.calls[0][0] as {
                data: { utmCampaign: string }
            }
            expect(arg.data.utmCampaign).toHaveLength(100)
        })

        test('still redirects when the insert rejects', async () => {
            mockInviteClickCreate.mockRejectedValue(new Error('db down'))
            const res = await request(buildApp()).get(
                '/invite?utm_source=topgg',
            )
            expect(res.status).toBe(302)
            await new Promise((resolve) => setImmediate(resolve))
            expect(mockLogAndSwallow).toHaveBeenCalledWith(
                expect.any(Error),
                'invite.recordClick',
            )
        })

        test('still redirects when the client cannot be created', async () => {
            mockGetPrismaClient.mockImplementation(() => {
                throw new Error('no client')
            })
            const res = await request(buildApp()).get('/invite')
            expect(res.status).toBe(302)
            expect(res.headers.location).toContain('discord.com')
            expect(mockLogAndSwallow).toHaveBeenCalledWith(
                expect.any(Error),
                'invite.recordClick',
            )
        })
    })
})

describe('referrerHostOf', () => {
    test('keeps only the host', () => {
        expect(
            referrerHostOf('https://discordbotlist.com/bots/lucky?x=1'),
        ).toBe('discordbotlist.com')
    })

    test('returns null for a missing or malformed referer', () => {
        expect(referrerHostOf(undefined)).toBeNull()
        expect(referrerHostOf('not a url')).toBeNull()
    })
})
