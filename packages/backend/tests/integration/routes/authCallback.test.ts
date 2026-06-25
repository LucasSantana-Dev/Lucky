import { errorHandler } from '../../../src/middleware/errorHandler'
import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { handleOAuthCallback } from '../../../src/routes/authCallback'
import { setupSessionMiddleware } from '../../../src/middleware/session'
import { sessionService } from '../../../src/services/SessionService'
import { discordOAuthService } from '../../../src/services/DiscordOAuthService'
import {
    MOCK_DISCORD_USER,
    MOCK_TOKEN_RESPONSE,
    MOCK_AUTH_CODE,
    MOCK_OAUTH_STATE,
} from '../../fixtures/mock-data'

jest.mock('../../../src/services/SessionService', () => ({
    sessionService: {
        setSession: jest.fn(),
    },
}))

jest.mock('../../../src/services/DiscordOAuthService', () => ({
    discordOAuthService: {
        exchangeCodeForToken: jest.fn(),
        getUserInfo: jest.fn(),
    },
}))

describe('OAuth Callback (handleOAuthCallback)', () => {
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

        app.get('/api/auth/callback', handleOAuthCallback)

        app.use(errorHandler)
        jest.clearAllMocks()
    })

    describe('State validation', () => {
        test('should reject callback without state parameter', async () => {
            mockSuccessfulOAuthFlow()

            const response = await request(app)
                .get('/api/auth/callback')
                .query({ code: MOCK_AUTH_CODE })
                .expect(302)

            expect(response.headers.location).toContain('invalid_state')
            expect(
                getDiscordOAuthMock().exchangeCodeForToken,
            ).not.toHaveBeenCalled()
        })

        test('should reject callback with mismatched state (timing-safe comparison)', async () => {
            mockSuccessfulOAuthFlow()

            const agent = request.agent(app)

            const response = await agent
                .get('/api/auth/callback')
                .query({ code: MOCK_AUTH_CODE, state: 'wrong_state_value' })
                .expect(302)

            expect(response.headers.location).toContain('invalid_state')
            expect(
                getDiscordOAuthMock().exchangeCodeForToken,
            ).not.toHaveBeenCalled()
        })

        test('should accept callback with matching state', async () => {
            mockSuccessfulOAuthFlow()

            const testApp = express()
            setupSessionMiddleware(testApp)

            testApp.use((req, _res, next) => {
                req.session.oauthState = MOCK_OAUTH_STATE
                req.session.save((err) => {
                    if (err) next(err)
                    else next()
                })
            })

            testApp.get('/api/auth/callback', handleOAuthCallback)
            testApp.use(errorHandler)

            const agent = request.agent(testApp)

            const response = await agent
                .get('/api/auth/callback')
                .query({ code: MOCK_AUTH_CODE, state: MOCK_OAUTH_STATE })
                .expect(302)

            expect(response.headers.location).toContain('authenticated=true')
            expect(
                getDiscordOAuthMock().exchangeCodeForToken,
            ).toHaveBeenCalled()
        })

        test('should reject callback when session has no state', async () => {
            mockSuccessfulOAuthFlow()

            const response = await request(app)
                .get('/api/auth/callback')
                .query({ code: MOCK_AUTH_CODE, state: MOCK_OAUTH_STATE })
                .expect(302)

            expect(response.headers.location).toContain('invalid_state')
            expect(
                getDiscordOAuthMock().exchangeCodeForToken,
            ).not.toHaveBeenCalled()
        })

        test('should clean up state after successful validation', async () => {
            mockSuccessfulOAuthFlow()

            const testApp = express()
            setupSessionMiddleware(testApp)

            let stateSet = true
            testApp.use((req, _res, next) => {
                if (stateSet) {
                    req.session.oauthState = MOCK_OAUTH_STATE
                    stateSet = false
                }
                next()
            })

            testApp.get('/api/auth/callback', handleOAuthCallback)
            testApp.use(errorHandler)

            const agent = request.agent(testApp)

            await agent
                .get('/api/auth/callback')
                .query({ code: MOCK_AUTH_CODE, state: MOCK_OAUTH_STATE })
                .expect(302)

            const secondAttempt = await agent
                .get('/api/auth/callback')
                .query({ code: MOCK_AUTH_CODE, state: MOCK_OAUTH_STATE })
                .expect(302)

            expect(secondAttempt.headers.location).toContain('invalid_state')
        })
    })

    describe('Session save error handling', () => {
        test('should handle session.save() error gracefully', async () => {
            const mockDiscordOAuth = getDiscordOAuthMock()
            mockDiscordOAuth.exchangeCodeForToken.mockResolvedValue(
                MOCK_TOKEN_RESPONSE,
            )
            mockDiscordOAuth.getUserInfo.mockResolvedValue(MOCK_DISCORD_USER)
            getSessionServiceMock().setSession.mockResolvedValue()

            const testApp = express()
            setupSessionMiddleware(testApp)

            let stateSet = true
            testApp.use((req, _res, next) => {
                if (stateSet) {
                    req.session.oauthState = MOCK_OAUTH_STATE
                    req.session.save((err) => {
                        if (err) {
                            next(err)
                        } else {
                            // Override save to fail on the actual callback request
                            const originalSave = req.session.save
                            req.session.save = jest.fn((callback) => {
                                callback(new Error('Session save failed'))
                            })
                            stateSet = false
                            next()
                        }
                    })
                } else {
                    next()
                }
            })

            testApp.get('/api/auth/callback', handleOAuthCallback)
            testApp.use(errorHandler)

            const agent = request.agent(testApp)

            const response = await agent
                .get('/api/auth/callback')
                .query({ code: MOCK_AUTH_CODE, state: MOCK_OAUTH_STATE })
                .expect(302)

            expect(response.headers.location).toContain('error=auth_failed')
            expect(response.headers.location).toContain('authentication_error')
        })
    })

    describe('Successful OAuth callback flow', () => {
        test('should complete successful OAuth callback with valid state', async () => {
            mockSuccessfulOAuthFlow()

            const testApp = express()
            setupSessionMiddleware(testApp)

            testApp.use((req, _res, next) => {
                req.session.oauthState = MOCK_OAUTH_STATE
                req.session.save((err) => {
                    if (err) next(err)
                    else next()
                })
            })

            testApp.get('/api/auth/callback', handleOAuthCallback)
            testApp.use(errorHandler)

            const agent = request.agent(testApp)

            const response = await agent
                .get('/api/auth/callback')
                .query({ code: MOCK_AUTH_CODE, state: MOCK_OAUTH_STATE })
                .expect(302)

            expect(response.headers.location).toContain('authenticated=true')
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
        })

        test('should set session data correctly on successful callback', async () => {
            mockSuccessfulOAuthFlow()

            const testApp = express()
            setupSessionMiddleware(testApp)

            testApp.use((req, _res, next) => {
                req.session.oauthState = MOCK_OAUTH_STATE
                req.session.save((err) => {
                    if (err) next(err)
                    else next()
                })
            })

            testApp.get('/api/auth/callback', handleOAuthCallback)
            testApp.use(errorHandler)

            const agent = request.agent(testApp)

            await agent
                .get('/api/auth/callback')
                .query({ code: MOCK_AUTH_CODE, state: MOCK_OAUTH_STATE })
                .expect(302)

            const mockSessionService = getSessionServiceMock()
            expect(mockSessionService.setSession).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    userId: MOCK_DISCORD_USER.id,
                    user: MOCK_DISCORD_USER,
                    accessToken: MOCK_TOKEN_RESPONSE.access_token,
                    refreshToken: MOCK_TOKEN_RESPONSE.refresh_token,
                    expiresAt: expect.any(Number),
                }),
            )
        })

        test('should redirect to dashboard on successful authentication', async () => {
            mockSuccessfulOAuthFlow()

            const testApp = express()
            setupSessionMiddleware(testApp)

            testApp.use((req, _res, next) => {
                req.session.oauthState = MOCK_OAUTH_STATE
                req.session.save((err) => {
                    if (err) next(err)
                    else next()
                })
            })

            testApp.get('/api/auth/callback', handleOAuthCallback)
            testApp.use(errorHandler)

            const agent = request.agent(testApp)

            const response = await agent
                .get('/api/auth/callback')
                .query({ code: MOCK_AUTH_CODE, state: MOCK_OAUTH_STATE })
                .expect(302)

            expect(response.headers.location).toContain('authenticated=true')
        })
    })

    describe('Missing or invalid code handling', () => {
        test('should return error when code is missing', async () => {
            const testApp = express()
            setupSessionMiddleware(testApp)

            testApp.use((req, _res, next) => {
                req.session.oauthState = MOCK_OAUTH_STATE
                next()
            })

            testApp.get('/api/auth/callback', handleOAuthCallback)
            testApp.use(errorHandler)

            const agent = request.agent(testApp)

            const response = await agent
                .get('/api/auth/callback')
                .query({ state: MOCK_OAUTH_STATE })
                .expect(302)

            expect(response.headers.location).toContain('error=missing_code')
        })
    })

    describe('OAuth error handling', () => {
        test('should handle Discord OAuth errors', async () => {
            mockSuccessfulOAuthFlow()

            const response = await request(app)
                .get('/api/auth/callback')
                .query({ error: 'access_denied' })
                .expect(302)

            expect(response.headers.location).toContain('error=auth_failed')
            expect(
                getDiscordOAuthMock().exchangeCodeForToken,
            ).not.toHaveBeenCalled()
        })

        test('should handle token exchange failure', async () => {
            getDiscordOAuthMock().exchangeCodeForToken.mockRejectedValue(
                new Error('Token exchange failed'),
            )

            const testApp = express()
            setupSessionMiddleware(testApp)

            testApp.use((req, _res, next) => {
                req.session.oauthState = MOCK_OAUTH_STATE
                next()
            })

            testApp.get('/api/auth/callback', handleOAuthCallback)
            testApp.use(errorHandler)

            const agent = request.agent(testApp)

            const response = await agent
                .get('/api/auth/callback')
                .query({ code: MOCK_AUTH_CODE, state: MOCK_OAUTH_STATE })
                .expect(302)

            expect(response.headers.location).toContain(
                'error=auth_failed&message=authentication_error',
            )
        })

        test('should handle getUserInfo failure', async () => {
            const mockDiscordOAuth = getDiscordOAuthMock()
            mockDiscordOAuth.exchangeCodeForToken.mockResolvedValue(
                MOCK_TOKEN_RESPONSE,
            )
            mockDiscordOAuth.getUserInfo.mockRejectedValue(
                new Error('Failed to get user info'),
            )

            const testApp = express()
            setupSessionMiddleware(testApp)

            testApp.use((req, _res, next) => {
                req.session.oauthState = MOCK_OAUTH_STATE
                next()
            })

            testApp.get('/api/auth/callback', handleOAuthCallback)
            testApp.use(errorHandler)

            const agent = request.agent(testApp)

            const response = await agent
                .get('/api/auth/callback')
                .query({ code: MOCK_AUTH_CODE, state: MOCK_OAUTH_STATE })
                .expect(302)

            expect(response.headers.location).toContain(
                'error=auth_failed&message=authentication_error',
            )
        })
    })

    describe('Edge cases', () => {
        test('should handle state with different encoding', async () => {
            mockSuccessfulOAuthFlow()

            const testApp = express()
            setupSessionMiddleware(testApp)

            const stateValue = Buffer.from('test-state-123').toString('hex')

            let stateSet = true
            testApp.use((req, _res, next) => {
                if (stateSet) {
                    req.session.oauthState = stateValue
                    req.session.save((err) => {
                        if (err) {
                            next(err)
                        } else {
                            stateSet = false
                            next()
                        }
                    })
                } else {
                    next()
                }
            })

            testApp.get('/api/auth/callback', handleOAuthCallback)
            testApp.use(errorHandler)

            const agent = request.agent(testApp)

            const response = await agent
                .get('/api/auth/callback')
                .query({ code: MOCK_AUTH_CODE, state: stateValue })
                .expect(302)

            expect(response.headers.location).toContain('authenticated=true')
        })
    })
})
