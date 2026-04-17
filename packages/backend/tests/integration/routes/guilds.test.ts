import { errorHandler } from '../../../src/middleware/errorHandler'
import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupGuildRoutes } from '../../../src/routes/guilds'
import { setupSessionMiddleware } from '../../../src/middleware/session'
import { sessionService } from '../../../src/services/SessionService'
import { guildService } from '../../../src/services/GuildService'
import { guildAccessService } from '../../../src/services/GuildAccessService'
import {
    MOCK_SESSION_DATA,
    MOCK_DISCORD_GUILDS,
} from '../../fixtures/mock-data'

jest.mock('../../../src/services/SessionService', () => ({
    sessionService: {
        getSession: jest.fn(),
    },
}))

jest.mock('../../../src/services/GuildService', () => ({
    guildService: {
        generateBotInviteUrl: jest.fn(),
        getGuildTextChannelOptions: jest.fn(),
    },
}))

jest.mock('../../../src/services/GuildAccessService', () => ({
    guildAccessService: {
        listAuthorizedGuilds: jest.fn(),
        resolveGuildContext: jest.fn(),
        hasAccess: jest.fn(),
    },
}))

describe.skip('Guilds Routes Integration', () => {
    let app: express.Express
    const defaultAccess = {
        guildId: '111111111111111111',
        owner: true,
        isAdmin: true,
        hasBot: true,
        roleIds: [],
        nickname: null,
        effectiveAccess: {
            overview: 'manage',
            settings: 'manage',
            moderation: 'manage',
            automation: 'manage',
            music: 'manage',
            integrations: 'manage',
        },
        canManageRbac: true,
    }

    beforeEach(() => {
        app = express()
        setupSessionMiddleware(app)
        setupGuildRoutes(app)
        app.use(errorHandler)
        jest.clearAllMocks()

        const mockGuildAccessService = guildAccessService as jest.Mocked<
            typeof guildAccessService
        >
        mockGuildAccessService.resolveGuildContext.mockResolvedValue(
            defaultAccess,
        )
        mockGuildAccessService.hasAccess.mockReturnValue(true)
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
                memberCount: null,
                categoryCount: null,
                textChannelCount: null,
                voiceChannelCount: null,
                roleCount: null,
                effectiveAccess: defaultAccess.effectiveAccess,
                canManageRbac: true,
            }))

            const mockGuildAccessService = guildAccessService as jest.Mocked<
                typeof guildAccessService
            >
            mockGuildAccessService.listAuthorizedGuilds.mockResolvedValue(
                enrichedGuilds,
            )

            const response = await request(app)
                .get('/api/guilds')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual({ guilds: enrichedGuilds })
            expect(
                mockGuildAccessService.listAuthorizedGuilds,
            ).toHaveBeenCalledWith(MOCK_SESSION_DATA)
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

            const mockGuildAccessService = guildAccessService as jest.Mocked<
                typeof guildAccessService
            >
            mockGuildAccessService.listAuthorizedGuilds.mockRejectedValue(
                new Error('Service error'),
            )

            const response = await request(app)
                .get('/api/guilds')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(500)

            expect(response.body).toEqual({ error: 'Internal server error' })
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
                memberCount: null,
                categoryCount: null,
                textChannelCount: null,
                voiceChannelCount: null,
                roleCount: null,
                effectiveAccess: defaultAccess.effectiveAccess,
                canManageRbac: true,
            }

            const mockGuildAccessService = guildAccessService as jest.Mocked<
                typeof guildAccessService
            >
            mockGuildAccessService.listAuthorizedGuilds.mockResolvedValue([
                guildDetails,
            ])

            const response = await request(app)
                .get('/api/guilds/111111111111111111')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual(guildDetails)
        })

        test('should return 404 when guild not found', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockGuildAccessService = guildAccessService as jest.Mocked<
                typeof guildAccessService
            >
            mockGuildAccessService.listAuthorizedGuilds.mockResolvedValue([])

            const response = await request(app)
                .get('/api/guilds/999999999999999999')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(404)

            expect(response.body).toEqual({
                error: 'Guild not found',
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

    describe('GET /api/guilds/:guildId/channels', () => {
        test('should return guild channel options when authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockGuildService = guildService as jest.Mocked<
                typeof guildService
            >
            mockGuildService.getGuildTextChannelOptions.mockResolvedValue([
                { id: '222222222222222222', name: '#general' },
                { id: '333333333333333333', name: '#clips' },
            ])

            const response = await request(app)
                .get('/api/guilds/111111111111111111/channels')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual({
                channels: [
                    { id: '222222222222222222', name: '#general' },
                    { id: '333333333333333333', name: '#clips' },
                ],
            })
            expect(
                mockGuildService.getGuildTextChannelOptions,
            ).toHaveBeenCalledWith('111111111111111111')
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/channels')
                .expect(401)

            expect(response.body).toEqual({
                error: 'Not authenticated',
            })
        })
    })

    describe('GET /api/guilds/:id/me', () => {
        test('should return member context for authorized non-overview user', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const nonOverviewAccess = {
                ...defaultAccess,
                isAdmin: false,
                roleIds: ['role-mod'],
                nickname: 'Mod Nick',
                effectiveAccess: {
                    overview: 'none',
                    settings: 'none',
                    moderation: 'view',
                    automation: 'view',
                    music: 'none',
                    integrations: 'none',
                },
                canManageRbac: false,
            }

            const mockGuildAccessService = guildAccessService as jest.Mocked<
                typeof guildAccessService
            >
            mockGuildAccessService.resolveGuildContext.mockResolvedValue(
                nonOverviewAccess,
            )

            const response = await request(app)
                .get('/api/guilds/111111111111111111/me')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual({
                guildId: '111111111111111111',
                nickname: 'Mod Nick',
                username: MOCK_SESSION_DATA.user.username,
                globalName: null,
                roleIds: ['role-mod'],
                effectiveAccess: nonOverviewAccess.effectiveAccess,
                canManageRbac: false,
            })
        })

        test('should return 403 when user has no guild access', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockGuildAccessService = guildAccessService as jest.Mocked<
                typeof guildAccessService
            >
            mockGuildAccessService.resolveGuildContext.mockResolvedValue(null)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/me')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(403)

            expect(response.body).toEqual({
                error: 'No access to this server',
            })
        })
    })
})
