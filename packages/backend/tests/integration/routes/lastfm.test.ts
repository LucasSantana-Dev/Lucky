import { errorHandler } from '../../../src/middleware/errorHandler'
import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import cookieParser from 'cookie-parser'
import crypto from 'node:crypto'
import { setupLastFmRoutes } from '../../../src/routes/lastfm'
import { setupSessionMiddleware } from '../../../src/middleware/session'
import { sessionService } from '../../../src/services/SessionService'
import { MOCK_SESSION_DATA } from '../../fixtures/mock-data'

jest.mock('../../../src/services/SessionService', () => ({
    sessionService: {
        getSession: jest.fn(),
        setSession: jest.fn(),
        deleteSession: jest.fn(),
    },
}))

const mockExchangeToken = jest.fn()
const mockIsConfigured = jest.fn()

jest.mock('../../../src/services/LastFmAuthService', () => ({
    exchangeTokenForSession: (...args: unknown[]) => mockExchangeToken(...args),
    isLastFmAuthConfigured: (...args: unknown[]) => mockIsConfigured(...args),
}))

const mockGetByDiscordId = jest.fn()
const mockSetLink = jest.fn()
const mockUnlink = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    redisClient: {
        isHealthy: jest.fn(() => true),
        get: jest.fn(),
        set: jest.fn(),
        setex: jest.fn(),
        del: jest.fn(),
        ping: jest.fn(() => Promise.resolve('PONG')),
    },
    featureToggleService: {
        isEnabledGlobal: jest.fn(() => true),
        isEnabledForGuild: jest.fn(() => true),
    },
    lastFmLinkService: {
        getByDiscordId: (...args: unknown[]) => mockGetByDiscordId(...args),
        set: (...args: unknown[]) => mockSetLink(...args),
        unlink: (...args: unknown[]) => mockUnlink(...args),
    },
    moderationService: { createCase: jest.fn(), getCase: jest.fn() },
    autoModService: { getSettings: jest.fn() },
    customCommandService: { getCommand: jest.fn() },
    autoMessageService: { getWelcomeMessage: jest.fn() },
    serverLogService: { createLog: jest.fn() },
    embedBuilderService: {},
    musicControlService: {},
}))

const SESSION_COOKIE = ['sessionId=valid_session_id']
const DISCORD_ID = MOCK_SESSION_DATA.user.id
const LINK_SECRET = 'test-session-secret'

function authed() {
    const mock = sessionService as jest.Mocked<typeof sessionService>
    mock.getSession.mockResolvedValue(MOCK_SESSION_DATA as never)
}

function buildState(discordId: string, secret: string): string {
    const payload = Buffer.from(discordId, 'utf8').toString('base64url')
    const sig = crypto
        .createHmac('sha256', secret)
        .update(discordId, 'utf8')
        .digest('hex')
    return `${payload}.${sig}`
}

describe('Last.fm Routes Integration', () => {
    let app: express.Express

    beforeEach(() => {
        app = express()
        app.use(cookieParser())
        setupSessionMiddleware(app)
        setupLastFmRoutes(app)
        app.use(errorHandler)
        jest.clearAllMocks()
        mockIsConfigured.mockReturnValue(true)
        process.env.LASTFM_API_KEY = 'test-api-key'
        process.env.WEBAPP_SESSION_SECRET = LINK_SECRET
    })

    afterEach(() => {
        delete process.env.LASTFM_API_KEY
        delete process.env.LASTFM_LINK_SECRET
        delete process.env.WEBAPP_BACKEND_URL
        delete process.env.WEBAPP_REDIRECT_URI
        delete process.env.WEBAPP_FRONTEND_URL
    })

    describe('GET /api/lastfm/status', () => {
        test('should return linked status', async () => {
            authed()
            mockGetByDiscordId.mockResolvedValue({
                lastFmUsername: 'testfm',
                sessionKey: 'abc',
            })

            const res = await request(app)
                .get('/api/lastfm/status')
                .set('Cookie', SESSION_COOKIE)
                .expect(200)

            expect(res.body).toEqual({
                configured: true,
                linked: true,
                username: 'testfm',
            })
        })

        test('should return unlinked status', async () => {
            authed()
            mockGetByDiscordId.mockResolvedValue(null)

            const res = await request(app)
                .get('/api/lastfm/status')
                .set('Cookie', SESSION_COOKIE)
                .expect(200)

            expect(res.body).toEqual({
                configured: true,
                linked: false,
                username: null,
            })
        })

        test('should return 401 without auth', async () => {
            const mock = sessionService as jest.Mocked<typeof sessionService>
            mock.getSession.mockResolvedValue(null as never)

            await request(app).get('/api/lastfm/status').expect(401)
        })

        test('should return 500 on service error', async () => {
            authed()
            mockGetByDiscordId.mockRejectedValue(new Error('db error'))

            const res = await request(app)
                .get('/api/lastfm/status')
                .set('Cookie', SESSION_COOKIE)
                .expect(500)

            expect(res.body.error).toBe('Failed to check status')
        })
    })

    describe('DELETE /api/lastfm/unlink', () => {
        test('should unlink successfully', async () => {
            authed()
            mockUnlink.mockResolvedValue(true)

            const res = await request(app)
                .delete('/api/lastfm/unlink')
                .set('Cookie', SESSION_COOKIE)
                .expect(200)

            expect(res.body).toEqual({ success: true })
            expect(mockUnlink).toHaveBeenCalledWith(DISCORD_ID)
        })

        test('should return 404 when no link exists', async () => {
            authed()
            mockUnlink.mockResolvedValue(false)

            const res = await request(app)
                .delete('/api/lastfm/unlink')
                .set('Cookie', SESSION_COOKIE)
                .expect(404)

            expect(res.body.error).toBe('No Last.fm link found')
        })

        test('should return 401 without auth', async () => {
            const mock = sessionService as jest.Mocked<typeof sessionService>
            mock.getSession.mockResolvedValue(null as never)

            await request(app).delete('/api/lastfm/unlink').expect(401)
        })

        test('should return 500 on service error', async () => {
            authed()
            mockUnlink.mockRejectedValue(new Error('db error'))

            const res = await request(app)
                .delete('/api/lastfm/unlink')
                .set('Cookie', SESSION_COOKIE)
                .expect(500)

            expect(res.body.error).toBe('Failed to unlink')
        })
    })

    describe('GET /api/lastfm/connect', () => {
        test('should redirect to last.fm with valid state', async () => {
            const state = buildState(DISCORD_ID, LINK_SECRET)

            const res = await request(app)
                .get('/api/lastfm/connect')
                .query({ state })
                .expect(302)

            expect(res.headers.location).toContain('last.fm/api/auth')
            expect(res.headers.location).toContain('api_key=test-api-key')
        })

        test('should use WEBAPP_BACKEND_URL for callback', async () => {
            process.env.WEBAPP_BACKEND_URL = 'https://api.example.com'
            const state = buildState(DISCORD_ID, LINK_SECRET)

            const res = await request(app)
                .get('/api/lastfm/connect')
                .query({ state })
                .expect(302)

            expect(res.headers.location).toContain(
                encodeURIComponent(
                    `https://api.example.com/api/lastfm/callback?state=${state}`,
                ),
            )
        })

        test('should normalize trailing slash in WEBAPP_BACKEND_URL callback origin', async () => {
            process.env.WEBAPP_BACKEND_URL = 'https://api.example.com/'
            const state = buildState(DISCORD_ID, LINK_SECRET)

            const res = await request(app)
                .get('/api/lastfm/connect')
                .query({ state })
                .expect(302)

            expect(res.headers.location).toContain(
                encodeURIComponent(
                    `https://api.example.com/api/lastfm/callback?state=${state}`,
                ),
            )
        })

        test('should derive callback origin from WEBAPP_REDIRECT_URI when backend url is unset', async () => {
            process.env.WEBAPP_REDIRECT_URI =
                'https://lucky.example.com/api/auth/callback'
            const state = buildState(DISCORD_ID, LINK_SECRET)

            const res = await request(app)
                .get('/api/lastfm/connect')
                .query({ state })
                .expect(302)

            expect(res.headers.location).toContain(
                encodeURIComponent(
                    `https://lucky.example.com/api/lastfm/callback?state=${state}`,
                ),
            )
        })

        test('should redirect with error when not configured', async () => {
            mockIsConfigured.mockReturnValue(false)

            const res = await request(app)
                .get('/api/lastfm/connect')
                .query({ state: 'anything' })
                .expect(302)

            expect(res.headers.location).toContain(
                'error=lastfm_not_configured',
            )
        })

        test('should redirect with error when state missing', async () => {
            const res = await request(app)
                .get('/api/lastfm/connect')
                .expect(302)

            expect(res.headers.location).toContain('error=lastfm_invalid_state')
        })

        test('should allow authenticated connect without state query', async () => {
            authed()

            const res = await request(app)
                .get('/api/lastfm/connect')
                .set('Cookie', SESSION_COOKIE)
                .expect(302)

            expect(res.headers.location).toContain('last.fm/api/auth')
            expect(res.headers.location).toContain('api_key=test-api-key')
            const cookies = res.headers['set-cookie']
            const stateCookie = Array.isArray(cookies)
                ? cookies.find((c: string) => c.startsWith('lastfm_state='))
                : undefined
            expect(stateCookie).toBeDefined()
            expect(stateCookie).toContain('HttpOnly')
        })

        test('should redirect with error on invalid state', async () => {
            const res = await request(app)
                .get('/api/lastfm/connect')
                .query({ state: 'bogus.signature' })
                .expect(302)

            expect(res.headers.location).toMatch(
                /error=lastfm_(invalid_state|connect_error)/,
            )
        })

        test('should redirect with error when api key missing', async () => {
            delete process.env.LASTFM_API_KEY
            const state = buildState(DISCORD_ID, LINK_SECRET)

            const res = await request(app)
                .get('/api/lastfm/connect')
                .query({ state })
                .expect(302)

            expect(res.headers.location).toContain(
                'error=lastfm_not_configured',
            )
        })

        test('should set state cookie', async () => {
            const state = buildState(DISCORD_ID, LINK_SECRET)

            const res = await request(app)
                .get('/api/lastfm/connect')
                .query({ state })
                .expect(302)

            const cookies = res.headers['set-cookie']
            const stateCookie = Array.isArray(cookies)
                ? cookies.find((c: string) => c.startsWith('lastfm_state='))
                : undefined
            expect(stateCookie).toBeDefined()
            expect(stateCookie).toContain('HttpOnly')
        })
    })

    describe('GET /api/lastfm/callback', () => {
        function getStateCookie(): string {
            const state = buildState(DISCORD_ID, LINK_SECRET)
            return `lastfm_state=${state}`
        }

        test('should link account on valid callback', async () => {
            mockExchangeToken.mockResolvedValue({
                sessionKey: 'sk_123',
                username: 'fmuser',
            })
            mockSetLink.mockResolvedValue(true)

            const res = await request(app)
                .get('/api/lastfm/callback')
                .query({ token: 'valid_token' })
                .set('Cookie', [getStateCookie()])
                .expect(302)

            expect(res.headers.location).toContain('lastfm_linked=true')
            expect(mockExchangeToken).toHaveBeenCalledWith('valid_token')
            expect(mockSetLink).toHaveBeenCalledWith(
                DISCORD_ID,
                'sk_123',
                'fmuser',
            )
        })

        test('should link account when valid state comes from query', async () => {
            const state = buildState(DISCORD_ID, LINK_SECRET)
            mockExchangeToken.mockResolvedValue({
                sessionKey: 'sk_123',
                username: 'fmuser',
            })
            mockSetLink.mockResolvedValue(true)

            const res = await request(app)
                .get('/api/lastfm/callback')
                .query({ token: 'valid_token', state })
                .expect(302)

            expect(res.headers.location).toContain('lastfm_linked=true')
            expect(mockSetLink).toHaveBeenCalledWith(
                DISCORD_ID,
                'sk_123',
                'fmuser',
            )
        })

        test('should redirect with error on missing token', async () => {
            const res = await request(app)
                .get('/api/lastfm/callback')
                .set('Cookie', [getStateCookie()])
                .expect(302)

            expect(res.headers.location).toContain('error=lastfm_missing_token')
        })

        test('should redirect with error on missing state cookie', async () => {
            const res = await request(app)
                .get('/api/lastfm/callback')
                .query({ token: 'valid_token' })
                .expect(302)

            expect(res.headers.location).toContain('error=lastfm_missing_state')
        })

        test('should redirect with error on invalid state cookie', async () => {
            const res = await request(app)
                .get('/api/lastfm/callback')
                .query({ token: 'valid_token' })
                .set('Cookie', ['lastfm_state=bad.signature'])
                .expect(302)

            expect(res.headers.location).toMatch(
                /error=lastfm_(invalid_state|callback_error)/,
            )
        })

        test('should redirect with error when exchange fails', async () => {
            mockExchangeToken.mockResolvedValue(null)

            const res = await request(app)
                .get('/api/lastfm/callback')
                .query({ token: 'bad_token' })
                .set('Cookie', [getStateCookie()])
                .expect(302)

            expect(res.headers.location).toContain(
                'error=lastfm_exchange_failed',
            )
        })

        test('should redirect with error when save fails', async () => {
            mockExchangeToken.mockResolvedValue({
                sessionKey: 'sk_123',
                username: 'fmuser',
            })
            mockSetLink.mockResolvedValue(false)

            const res = await request(app)
                .get('/api/lastfm/callback')
                .query({ token: 'valid_token' })
                .set('Cookie', [getStateCookie()])
                .expect(302)

            expect(res.headers.location).toContain('error=lastfm_save_failed')
        })

        test('should redirect with error on exception', async () => {
            mockExchangeToken.mockRejectedValue(new Error('network'))

            const res = await request(app)
                .get('/api/lastfm/callback')
                .query({ token: 'valid_token' })
                .set('Cookie', [getStateCookie()])
                .expect(302)

            expect(res.headers.location).toContain(
                'error=lastfm_callback_error',
            )
        })

        test('should use custom frontend url for redirects', async () => {
            process.env.WEBAPP_FRONTEND_URL = 'https://app.example.com'
            mockExchangeToken.mockResolvedValue({
                sessionKey: 'sk_123',
                username: 'fmuser',
            })
            mockSetLink.mockResolvedValue(true)

            const res = await request(app)
                .get('/api/lastfm/callback')
                .query({ token: 'valid_token' })
                .set('Cookie', [getStateCookie()])
                .expect(302)

            expect(res.headers.location).toContain('https://app.example.com')
        })
    })
})
