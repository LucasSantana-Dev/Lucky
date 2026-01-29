import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupGuildRoutes } from '../../../src/routes/guilds'
import { setupSessionMiddleware } from '../../../src/middleware/session'
import { sessionService } from '../../../src/services/SessionService'
import { guildService } from '../../../src/services/GuildService'
import {
    MOCK_SESSION_DATA,
    MOCK_DISCORD_GUILDS,
    MOCK_TOKEN_RESPONSE,
} from '../../fixtures/mock-data'

jest.mock('../../../src/services/SessionService', () => ({
    sessionService: {
        getSession: jest.fn(),
    },
}))

jest.mock('../../../src/services/GuildService', () => ({
    guildService: {
        getUserGuilds: jest.fn(),
        enrichGuildsWithBotStatus: jest.fn(),
        getGuildDetails: jest.fn(),
        generateBotInviteUrl: jest.fn(),
    },
}))

describe('Guilds Routes Integration', () => {
    let app: express.Express

    beforeEach(() => {
        app = express()
        setupSessionMiddleware(app)
        setupGuildRoutes(app)
        jest.clearAllMocks()
    })

    describe('GET /api/guilds', () => {
        test('should return user guilds when authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const enrichedGuilds = MOCK_DISCORD_GUILDS.map((guild) => ({
                ...guild,
                hasBot: true,
                botInviteUrl: undefined,
            }))

            const mockGuildService = guildService as jest.Mocked<
                typeof guildService
            >
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

            expect(response.body).toEqual({ guilds: enrichedGuilds })
            expect(mockGuildService.getUserGuilds).toHaveBeenCalledWith(
                MOCK_SESSION_DATA.accessToken,
            )
            expect(
                mockGuildService.enrichGuildsWithBotStatus,
            ).toHaveBeenCalledWith(MOCK_DISCORD_GUILDS)
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app).get('/api/guilds').expect(401)

            expect(response.body).toEqual({
                error: 'Not authenticated',
            })
        })

        test('should return 500 on service error', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockGuildService = guildService as jest.Mocked<
                typeof guildService
            >
            mockGuildService.getUserGuilds.mockRejectedValue(
                new Error('Service error'),
            )

            const response = await request(app)
                .get('/api/guilds')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(500)

            expect(response.body).toEqual({ error: 'Failed to fetch guilds' })
        })
    })

    describe('GET /api/guilds/:id', () => {
        test('should return guild details when bot is in guild', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const guildDetails = {
                ...MOCK_DISCORD_GUILDS[0],
                hasBot: true,
                botInviteUrl:
                    'https://discord.com/api/oauth2/authorize?client_id=test&guild_id=111111111111111111',
            }

            const mockGuildService = guildService as jest.Mocked<
                typeof guildService
            >
            mockGuildService.getGuildDetails.mockResolvedValue(guildDetails)

            const response = await request(app)
                .get('/api/guilds/111111111111111111')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual(guildDetails)
            expect(mockGuildService.getGuildDetails).toHaveBeenCalledWith(
                '111111111111111111',
            )
        })

        test('should return 404 when guild not found', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockGuildService = guildService as jest.Mocked<
                typeof guildService
            >
            mockGuildService.getGuildDetails.mockResolvedValue(null)

            const response = await request(app)
                .get('/api/guilds/999999999999999999')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(404)

            expect(response.body).toEqual({
                error: 'Guild not found or bot not in guild',
            })
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .get('/api/guilds/111111111111111111')
                .expect(401)

            expect(response.body).toEqual({
                error: 'Not authenticated',
            })
        })
    })

    describe('GET /api/guilds/:id/invite', () => {
        test('should generate invite URL', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const inviteUrl =
                'https://discord.com/api/oauth2/authorize?client_id=test&guild_id=111111111111111111'

            const mockGuildService = guildService as jest.Mocked<
                typeof guildService
            >
            mockGuildService.generateBotInviteUrl.mockReturnValue(inviteUrl)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/invite')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual({ inviteUrl })
            expect(mockGuildService.generateBotInviteUrl).toHaveBeenCalledWith(
                '111111111111111111',
            )
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/invite')
                .expect(401)

            expect(response.body).toEqual({
                error: 'Not authenticated',
            })
        })
    })
})
