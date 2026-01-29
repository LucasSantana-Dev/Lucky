import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupAuthRoutes } from '../../src/routes/auth'
import { setupGuildRoutes } from '../../src/routes/guilds'
import { setupToggleRoutes } from '../../src/routes/toggles'
import { setupSessionMiddleware } from '../../src/middleware/session'
import { sessionService } from '../../src/services/SessionService'
import { discordOAuthService } from '../../src/services/DiscordOAuthService'
import {
    MOCK_SESSION_DATA,
    MOCK_TOKEN_RESPONSE,
    MOCK_DISCORD_USER,
    MOCK_AUTH_CODE,
    MOCK_DISCORD_GUILDS,
} from '../fixtures/mock-data'

jest.mock('../../src/services/SessionService', () => ({
    sessionService: {
        getSession: jest.fn(),
        setSession: jest.fn(),
        deleteSession: jest.fn(),
    },
}))

jest.mock('../../src/services/DiscordOAuthService', () => ({
    discordOAuthService: {
        exchangeCodeForToken: jest.fn(),
        getUserInfo: jest.fn(),
    },
}))

jest.mock('../../src/services/GuildService', () => ({
    guildService: {
        getUserGuilds: jest.fn(),
        enrichGuildsWithBotStatus: jest.fn(),
    },
}))

jest.mock('@lukbot/shared/services', () => ({
    featureToggleService: {
        getAllToggles: jest.fn(() => new Map()),
        isEnabledGlobal: jest.fn(),
        isEnabledForGuild: jest.fn(),
    },
}))

jest.mock('@lukbot/shared/config', () => ({
    getFeatureToggleConfig: jest.fn(() => ({})),
}))

describe('API Integration Flows', () => {
    let app: express.Express

    beforeEach(() => {
        app = express()
        setupSessionMiddleware(app)
        setupAuthRoutes(app)
        setupGuildRoutes(app)
        setupToggleRoutes(app)
        jest.clearAllMocks()
    })

    describe('Complete OAuth Flow', () => {
        test('should complete full OAuth authentication flow', async () => {
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
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const callbackResponse = await request(app)
                .get('/api/auth/callback')
                .query({ code: MOCK_AUTH_CODE })
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(302)

            expect(callbackResponse.headers.location).toContain(
                'authenticated=true',
            )
            expect(mockDiscordOAuth.exchangeCodeForToken).toHaveBeenCalledWith(
                MOCK_AUTH_CODE,
            )
            expect(mockDiscordOAuth.getUserInfo).toHaveBeenCalledWith(
                MOCK_TOKEN_RESPONSE.access_token,
            )
            expect(mockSessionService.setSession).toHaveBeenCalled()

            const statusResponse = await request(app)
                .get('/api/auth/status')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(statusResponse.body.authenticated).toBe(true)
            expect(statusResponse.body.user.id).toBe(MOCK_DISCORD_USER.id)
        })
    })

    describe('Session Persistence', () => {
        test('should persist session across multiple requests', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const statusResponse1 = await request(app)
                .get('/api/auth/status')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(statusResponse1.body.authenticated).toBe(true)

            const userResponse = await request(app)
                .get('/api/auth/user')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(userResponse.body.id).toBe(MOCK_SESSION_DATA.user.id)

            expect(mockSessionService.getSession).toHaveBeenCalledTimes(2)
        })
    })

    describe('Error Handling', () => {
        test('should handle errors gracefully across routes', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockRejectedValue(
                new Error('Service error'),
            )

            const statusResponse = await request(app)
                .get('/api/auth/status')
                .set('Cookie', ['sessionId=error_session_id'])
                .expect(200)

            expect(statusResponse.body.authenticated).toBe(false)
        })

        test('should return appropriate error codes', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const protectedResponse = await request(app)
                .get('/api/auth/user')
                .expect(401)

            expect(protectedResponse.body).toEqual({
                error: 'Not authenticated',
            })
        })
    })

    describe('CORS Headers', () => {
        test('should include CORS headers in responses', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const response = await request(app)
                .get('/api/auth/status')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.headers['content-type']).toContain(
                'application/json',
            )
        })
    })

    describe('Guild and Feature Integration', () => {
        test('should fetch guilds after authentication', async () => {
            const { guildService } =
                await import('../../src/services/GuildService')
            const mockGuildService = guildService as jest.Mocked<
                typeof guildService
            >

            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const enrichedGuilds = MOCK_DISCORD_GUILDS.map((guild) => ({
                ...guild,
                hasBot: true,
            }))

            mockGuildService.getUserGuilds.mockResolvedValue(
                MOCK_DISCORD_GUILDS,
            )
            mockGuildService.enrichGuildsWithBotStatus.mockResolvedValue(
                enrichedGuilds,
            )

            const response = await request(app)
                .get('/api/guilds')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toHaveProperty('guilds')
            expect(Array.isArray(response.body.guilds)).toBe(true)
        })
    })
})
