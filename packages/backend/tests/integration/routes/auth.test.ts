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

    beforeEach(() => {
        app = express()
        setupSessionMiddleware(app)
        setupAuthRoutes(app)
        jest.clearAllMocks()
    })

    describe('GET /api/auth/discord', () => {
        test('should redirect to Discord OAuth', async () => {
            const response = await request(app)
                .get('/api/auth/discord')
                .expect(302)

            expect(response.headers.location).toContain(
                'discord.com/api/oauth2/authorize',
            )
            expect(response.headers.location).toContain(
                'client_id=test-client-id',
            )
            expect(response.headers.location).toContain('response_type=code')
            expect(response.headers.location).toContain(
                'scope=identify%20guilds',
            )
        })

        test('should return 500 when CLIENT_ID is missing', async () => {
            const originalClientId = process.env.CLIENT_ID
            delete process.env.CLIENT_ID

            const response = await request(app)
                .get('/api/auth/discord')
                .expect(500)

            expect(response.body).toEqual({
                error: 'Discord client ID not configured',
            })

            if (originalClientId) {
                process.env.CLIENT_ID = originalClientId
            }
        })
    })

    describe('GET /api/auth/callback', () => {
        test('should handle successful OAuth callback', async () => {
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
                .get('/api/auth/callback')
                .query({ code: MOCK_AUTH_CODE })
                .expect(302)

            expect(response.headers.location).toContain('authenticated=true')
            expect(mockDiscordOAuth.exchangeCodeForToken).toHaveBeenCalledWith(
                MOCK_AUTH_CODE,
            )
            expect(mockDiscordOAuth.getUserInfo).toHaveBeenCalledWith(
                MOCK_TOKEN_RESPONSE.access_token,
            )
            expect(mockSessionService.setSession).toHaveBeenCalled()
        })

        test('should return 400 when code is missing', async () => {
            const response = await request(app)
                .get('/api/auth/callback')
                .expect(400)

            expect(response.body).toEqual({
                error: 'Missing authorization code',
            })
        })

        test('should return 500 when token exchange fails', async () => {
            const mockDiscordOAuth = discordOAuthService as jest.Mocked<
                typeof discordOAuthService
            >
            mockDiscordOAuth.exchangeCodeForToken.mockRejectedValue(
                new Error('Token exchange failed'),
            )

            const response = await request(app)
                .get('/api/auth/callback')
                .query({ code: MOCK_AUTH_CODE })
                .expect(500)

            expect(response.body).toEqual({ error: 'Authentication failed' })
        })

        test('should return 500 when session ID is missing', async () => {
            const mockDiscordOAuth = discordOAuthService as jest.Mocked<
                typeof discordOAuthService
            >
            mockDiscordOAuth.exchangeCodeForToken.mockResolvedValue(
                MOCK_TOKEN_RESPONSE,
            )
            mockDiscordOAuth.getUserInfo.mockResolvedValue(MOCK_DISCORD_USER)

            const response = await request(app)
                .get('/api/auth/callback')
                .query({ code: MOCK_AUTH_CODE })
                .expect(500)

            expect(response.body).toEqual({ error: 'Failed to create session' })
        })
    })

    describe('GET /api/auth/logout', () => {
        test('should logout successfully', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
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
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .get('/api/auth/logout')
                .expect(401)

            expect(response.body).toEqual({
                error: 'Session expired or invalid',
            })
        })
    })

    describe('GET /api/auth/status', () => {
        test('should return authenticated status when session exists', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
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
                },
            })
        })

        test('should return unauthenticated when session does not exist', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
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
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
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
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
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
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .get('/api/auth/user')
                .expect(401)

            expect(response.body).toEqual({
                error: 'Session expired or invalid',
            })
        })
    })
})
