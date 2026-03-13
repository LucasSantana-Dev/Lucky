import { errorHandler } from '../../../src/middleware/errorHandler'
import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupAuthRoutes } from '../../../src/routes/auth'
import { setupSessionMiddleware } from '../../../src/middleware/session'
import { sessionService } from '../../../src/services/SessionService'
import { discordOAuthService } from '../../../src/services/DiscordOAuthService'
import {
    MOCK_SESSION_DATA,
    MOCK_TOKEN_RESPONSE,
    MOCK_DISCORD_USER,
    MOCK_AUTH_CODE,
} from '../../fixtures/mock-data'

jest.mock('../../../src/services/SessionService', () => ({
    sessionService: {
        getSession: jest.fn(),
        setSession: jest.fn(),
        deleteSession: jest.fn(),
    },
}))

jest.mock('../../../src/services/DiscordOAuthService', () => ({
    discordOAuthService: {
        exchangeCodeForToken: jest.fn(),
        getUserInfo: jest.fn(),
    },
}))

describe('Auth Routes Integration', () => {
    let app: express.Express

    const getDiscordOAuthMock = () =>
        discordOAuthService as jest.Mocked<typeof discordOAuthService>

    const getSessionServiceMock = () =>
        sessionService as jest.Mocked<typeof sessionService>

    function mockSuccessfulOAuthFlow(): void {
        const mockDiscordOAuth = getDiscordOAuthMock()
        const mockSessionService = getSessionServiceMock()

        mockDiscordOAuth.exchangeCodeForToken.mockResolvedValue(
            MOCK_TOKEN_RESPONSE,
        )
        mockDiscordOAuth.getUserInfo.mockResolvedValue(MOCK_DISCORD_USER)
        mockSessionService.setSession.mockResolvedValue()
    }

    beforeEach(() => {
        app = express()
        setupSessionMiddleware(app)
        setupAuthRoutes(app)
        app.use(errorHandler)
        jest.clearAllMocks()
    })

    describe('GET /api/auth/discord', () => {
        test('should redirect to Discord OAuth', async () => {
            const response = await request(app)
                .get('/api/auth/discord')
                .expect(302)

            const location = response.headers.location
            expect(location).toContain('discord.com/api/oauth2/authorize')

            const url = new URL(location)
            expect(url.searchParams.get('client_id')).toBe('test-client-id')
            expect(url.searchParams.get('response_type')).toBe('code')
            expect(url.searchParams.get('scope')).toBe('identify guilds')
            expect(url.searchParams.get('redirect_uri')).toBe(
                'http://localhost:3000/api/auth/callback',
            )
        })

        test('should derive redirect uri from forwarded host when env is unset', async () => {
            const originalRedirectUri = process.env.WEBAPP_REDIRECT_URI
            delete process.env.WEBAPP_REDIRECT_URI

            try {
                const response = await request(app)
                    .get('/api/auth/discord')
                    .set('x-forwarded-proto', 'https')
                    .set('x-forwarded-host', 'lucky.lucassantana.tech')
                    .expect(302)

                expect(response.headers.location).toContain(
                    encodeURIComponent(
                        'https://lucky.lucassantana.tech/api/auth/callback',
                    ),
                )
            } finally {
                if (originalRedirectUri) {
                    process.env.WEBAPP_REDIRECT_URI = originalRedirectUri
                }
            }
        })

        test('should derive callback from forwarded host in production when env is unset', async () => {
            const originalRedirectUri = process.env.WEBAPP_REDIRECT_URI
            const originalNodeEnv = process.env.NODE_ENV
            delete process.env.WEBAPP_REDIRECT_URI
            process.env.NODE_ENV = 'production'

            try {
                const response = await request(app)
                    .get('/api/auth/discord')
                    .set('x-forwarded-proto', 'https')
                    .set('x-forwarded-host', 'lucky.lucassantana.tech')
                    .expect(302)

                expect(response.headers.location).toContain(
                    encodeURIComponent(
                        'https://lucky.lucassantana.tech/api/auth/callback',
                    ),
                )
            } finally {
                if (originalRedirectUri) {
                    process.env.WEBAPP_REDIRECT_URI = originalRedirectUri
                }
                process.env.NODE_ENV = originalNodeEnv
            }
        })

        test('should emit secure session cookie for https forwarded requests', async () => {
            const originalNodeEnv = process.env.NODE_ENV
            process.env.NODE_ENV = 'production'

            try {
                const localApp = express()
                setupSessionMiddleware(localApp)
                setupAuthRoutes(localApp)
                localApp.use(errorHandler)

                const response = await request(localApp)
                    .get('/api/auth/discord')
                    .set('x-forwarded-proto', 'https')
                    .set('x-forwarded-host', 'lucky.lucassantana.tech')
                    .expect(302)

                const cookies = response.headers['set-cookie'] as
                    | string[]
                    | undefined

                expect(cookies).toBeDefined()
                expect(
                    cookies?.some(
                        (cookie) =>
                            cookie.includes('sessionId=') &&
                            cookie.includes('Secure') &&
                            cookie.includes('SameSite=Lax'),
                    ),
                ).toBe(true)
            } finally {
                process.env.NODE_ENV = originalNodeEnv
            }
        })

        test('should not emit secure session cookie for http forwarded requests', async () => {
            const originalNodeEnv = process.env.NODE_ENV
            process.env.NODE_ENV = 'production'

            try {
                const localApp = express()
                setupSessionMiddleware(localApp)
                setupAuthRoutes(localApp)
                localApp.use(errorHandler)

                const response = await request(localApp)
                    .get('/api/auth/discord')
                    .set('x-forwarded-proto', 'http')
                    .set('x-forwarded-host', 'lucky.lucassantana.tech')
                    .expect(302)

                expect(response.headers['set-cookie']).toBeUndefined()
            } finally {
                process.env.NODE_ENV = originalNodeEnv
            }
        })

        test('should return 500 when CLIENT_ID is missing', async () => {
            const originalClientId = process.env.CLIENT_ID
            delete process.env.CLIENT_ID

            const response = await request(app)
                .get('/api/auth/discord')
                .expect(302)

            expect(response.headers.location).toContain(
                'error=auth_failed&message=client_id_not_configured',
            )

            if (originalClientId) {
                process.env.CLIENT_ID = originalClientId
            }
        })

        test('should keep configured callback and secure cookie in production', async () => {
            const originalNodeEnv = process.env.NODE_ENV
            const originalRedirectUri = process.env.WEBAPP_REDIRECT_URI
            const originalBackendUrl = process.env.WEBAPP_BACKEND_URL

            process.env.NODE_ENV = 'production'
            process.env.WEBAPP_REDIRECT_URI =
                'https://lucky.lucassantana.tech/api/auth/callback'
            process.env.WEBAPP_BACKEND_URL =
                'https://lucky-api.lucassantana.tech'

            const productionApp = express()
            productionApp.set('trust proxy', 1)
            setupSessionMiddleware(productionApp)
            setupAuthRoutes(productionApp)
            productionApp.use(errorHandler)

            const response = await request(productionApp)
                .get('/api/auth/discord')
                .set('x-forwarded-proto', 'https')
                .expect(302)

            expect(response.headers.location).toContain(
                encodeURIComponent(
                    'https://lucky.lucassantana.tech/api/auth/callback',
                ),
            )

            const cookies = response.headers['set-cookie'] ?? []
            expect(cookies.join(';')).toContain('Secure')
            expect(cookies.join(';')).toContain('HttpOnly')
            expect(cookies.join(';')).toContain('SameSite=Lax')

            process.env.NODE_ENV = originalNodeEnv
            if (originalRedirectUri) {
                process.env.WEBAPP_REDIRECT_URI = originalRedirectUri
            } else {
                delete process.env.WEBAPP_REDIRECT_URI
            }
            if (originalBackendUrl) {
                process.env.WEBAPP_BACKEND_URL = originalBackendUrl
            } else {
                delete process.env.WEBAPP_BACKEND_URL
            }
        })
    })

    describe('GET /api/auth/callback', () => {
        test('should resolve callback redirect uri from forwarded host when env is unset', async () => {
            const originalRedirectUri = process.env.WEBAPP_REDIRECT_URI
            delete process.env.WEBAPP_REDIRECT_URI

            mockSuccessfulOAuthFlow()

            await request(app)
                .get('/api/auth/callback')
                .query({ code: MOCK_AUTH_CODE })
                .set('x-forwarded-proto', 'https')
                .set('x-forwarded-host', 'lucky.lucassantana.tech')
                .expect(302)

            expect(
                getDiscordOAuthMock().exchangeCodeForToken,
            ).toHaveBeenCalledWith(
                MOCK_AUTH_CODE,
                'https://lucky.lucassantana.tech/api/auth/callback',
            )

            if (originalRedirectUri) {
                process.env.WEBAPP_REDIRECT_URI = originalRedirectUri
            }
        })

        test.each(['/api/auth/callback', '/auth/callback'])(
            'should handle successful OAuth callback for %s',
            async (routePath) => {
                mockSuccessfulOAuthFlow()

                const response = await request(app)
                    .get(routePath)
                    .query({ code: MOCK_AUTH_CODE })
                    .set('Cookie', ['sessionId=callback_session_id'])
                    .expect(302)

                expect(response.headers.location).toContain(
                    'authenticated=true',
                )
                expect(
                    getDiscordOAuthMock().exchangeCodeForToken,
                ).toHaveBeenCalledWith(
                    MOCK_AUTH_CODE,
                    expect.stringContaining('/api/auth/callback'),
                )
                expect(getDiscordOAuthMock().getUserInfo).toHaveBeenCalledWith(
                    MOCK_TOKEN_RESPONSE.access_token,
                )
                expect(getSessionServiceMock().setSession).toHaveBeenCalled()
            },
        )

        test('should return 400 when code is missing', async () => {
            const response = await request(app)
                .get('/api/auth/callback')
                .expect(302)

            expect(response.headers.location).toContain('error=missing_code')
        })

        test('should return 500 when token exchange fails', async () => {
            getDiscordOAuthMock().exchangeCodeForToken.mockRejectedValue(
                new Error('Token exchange failed'),
            )

            const response = await request(app)
                .get('/api/auth/callback')
                .query({ code: MOCK_AUTH_CODE })
                .set('Cookie', ['sessionId=callback_session_id'])
                .expect(302)

            expect(response.headers.location).toContain(
                'error=auth_failed&message=authentication_error',
            )
        })

        test('should return 500 when session ID is missing', async () => {
            mockSuccessfulOAuthFlow()

            const response = await request(app)
                .get('/api/auth/callback')
                .query({ code: MOCK_AUTH_CODE })
                .expect(302)

            expect(response.headers.location).toContain('error=session_failed')
        })

        test('should handle callback alias route', async () => {
            const mockDiscordOAuth = discordOAuthService as jest.Mocked<
                typeof discordOAuthService
            >
            mockDiscordOAuth.exchangeCodeForToken.mockResolvedValue(
                MOCK_TOKEN_RESPONSE,
            )
            mockDiscordOAuth.getUserInfo.mockResolvedValue(MOCK_DISCORD_USER)

            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.setSession.mockResolvedValue()

            const response = await request(app)
                .get('/auth/callback')
                .query({ code: MOCK_AUTH_CODE })
                .set('Cookie', ['sessionId=callback_session_id'])
                .expect(302)

            expect(response.headers.location).toContain('authenticated=true')
            expect(mockDiscordOAuth.exchangeCodeForToken).toHaveBeenCalledWith(
                MOCK_AUTH_CODE,
                expect.stringContaining('/api/auth/callback'),
            )
        })
    })

    describe('GET /api/auth/logout', () => {
        test('should logout successfully', async () => {
            const mockSessionService = getSessionServiceMock()
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)
            mockSessionService.deleteSession.mockResolvedValue()

            const response = await request(app)
                .get('/api/auth/logout')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual({ success: true })
            expect(mockSessionService.deleteSession).toHaveBeenCalled()
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = getSessionServiceMock()
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .get('/api/auth/logout')
                .expect(401)

            expect(response.body).toEqual({
                error: 'Not authenticated',
            })
        })
    })

    describe('GET /api/auth/status', () => {
        test('should return authenticated status when session exists', async () => {
            const mockSessionService = getSessionServiceMock()
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const response = await request(app)
                .get('/api/auth/status')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual({
                authenticated: true,
                user: {
                    id: MOCK_SESSION_DATA.user.id,
                    username: MOCK_SESSION_DATA.user.username,
                    discriminator: MOCK_SESSION_DATA.user.discriminator,
                    avatar: MOCK_SESSION_DATA.user.avatar,
                    isDeveloper: false,
                },
            })
        })

        test('should flag authenticated developer users', async () => {
            const mockSessionService = getSessionServiceMock()
            mockSessionService.getSession.mockResolvedValue({
                ...MOCK_SESSION_DATA,
                user: {
                    ...MOCK_SESSION_DATA.user,
                    id: '123456789',
                },
            })

            const response = await request(app)
                .get('/api/auth/status')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toMatchObject({
                authenticated: true,
                user: {
                    id: '123456789',
                    isDeveloper: true,
                },
            })
        })

        test('should return unauthenticated when session does not exist', async () => {
            const mockSessionService = getSessionServiceMock()
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .get('/api/auth/status')
                .expect(200)

            expect(response.body).toEqual({ authenticated: false })
        })

        test('should return unauthenticated when session ID is missing', async () => {
            const response = await request(app)
                .get('/api/auth/status')
                .expect(200)

            expect(response.body).toEqual({ authenticated: false })
        })

        test('should return unauthenticated on error', async () => {
            const mockSessionService = getSessionServiceMock()
            mockSessionService.getSession.mockRejectedValue(
                new Error('Service error'),
            )

            const response = await request(app)
                .get('/api/auth/status')
                .set('Cookie', ['sessionId=error_session_id'])
                .expect(200)

            expect(response.body).toEqual({ authenticated: false })
        })
    })

    describe('GET /api/auth/user', () => {
        test('should return user data when authenticated', async () => {
            const mockSessionService = getSessionServiceMock()
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const response = await request(app)
                .get('/api/auth/user')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual({
                id: MOCK_SESSION_DATA.user.id,
                username: MOCK_SESSION_DATA.user.username,
                discriminator: MOCK_SESSION_DATA.user.discriminator,
                avatar: MOCK_SESSION_DATA.user.avatar,
            })
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = getSessionServiceMock()
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .get('/api/auth/user')
                .expect(401)

            expect(response.body).toEqual({
                error: 'Not authenticated',
            })
        })
    })
})
