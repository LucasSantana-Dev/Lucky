import { errorHandler } from '../../../src/middleware/errorHandler'
import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupEmbedRoutes } from '../../../src/routes/managementEmbeds'
import { setupSessionMiddleware } from '../../../src/middleware/session'
import { sessionService } from '../../../src/services/SessionService'
import { MOCK_SESSION_DATA, MOCK_GUILD_CONTEXT } from '../../fixtures/mock-data'

jest.mock('../../../src/services/SessionService', () => ({
    sessionService: {
        getSession: jest.fn(),
    },
}))

jest.mock('../../../src/services/GuildAccessService', () => ({
    guildAccessService: {
        resolveGuildContext: jest.fn(),
        hasAccess: jest.fn(),
    },
}))

jest.mock('@lucky/shared/services', () => ({
    embedBuilderService: {
        listTemplates: jest.fn(),
        createTemplate: jest.fn(),
        updateTemplate: jest.fn(),
        deleteTemplate: jest.fn(),
        validateEmbedData: jest.fn(),
    },
    serverLogService: {
        logEmbedTemplateChange: jest.fn(),
    },
}))

import { embedBuilderService, serverLogService } from '@lucky/shared/services'
import { guildAccessService } from '../../../src/services/GuildAccessService'

describe('Embed Management Routes Integration', () => {
    let app: express.Express

    beforeEach(() => {
        app = express()
        app.use(express.json())
        setupSessionMiddleware(app)
        setupEmbedRoutes(app)
        app.use(errorHandler)
        jest.clearAllMocks()

        const mockSessionService = sessionService as jest.Mocked<
            typeof sessionService
        >
        mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

        const mockGuildAccessService = guildAccessService as jest.Mocked<
            typeof guildAccessService
        >
        mockGuildAccessService.resolveGuildContext.mockResolvedValue(
            MOCK_GUILD_CONTEXT,
        )
        mockGuildAccessService.hasAccess.mockReturnValue(true)
    })

    describe('GET /api/guilds/:guildId/embeds', () => {
        test('should return templates list when authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockTemplates = [
                { name: 'welcome', title: 'Welcome Embed', data: {} },
                { name: 'rules', title: 'Server Rules', data: {} },
            ]

            const mockEmbedService = embedBuilderService as jest.Mocked<
                typeof embedBuilderService
            >
            mockEmbedService.listTemplates.mockResolvedValue(mockTemplates)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/embeds')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual({ templates: mockTemplates })
            expect(mockEmbedService.listTemplates).toHaveBeenCalledWith(
                '111111111111111111',
            )
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/embeds')
                .expect(401)

            expect(response.body).toEqual({
                error: 'Not authenticated',
            })
        })

        test('should return 403 for unauthorized user', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockGuildAccessServiceSvc = guildAccessService as jest.Mocked<
                typeof guildAccessService
            >
            mockGuildAccessServiceSvc.resolveGuildContext.mockResolvedValue(null)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/embeds')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(403)

            expect(response.body).toEqual({
                error: 'No access to this server',
            })
        })
    })

    describe('POST /api/guilds/:guildId/embeds', () => {
        test('should create new template and log change', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const requestBody = {
                name: 'welcome',
                description: 'Welcome template',
                embedData: { title: 'Welcome Embed', color: '#341503' },
            }
            const responseBody = {
                name: 'welcome',
                description: 'Welcome template',
                embedData: { title: 'Welcome Embed', color: '#341503' },
            }

            const mockEmbedService = embedBuilderService as jest.Mocked<
                typeof embedBuilderService
            >
            mockEmbedService.validateEmbedData.mockReturnValue({ valid: true })
            mockEmbedService.createTemplate.mockResolvedValue(responseBody)

            const mockServerLogService = serverLogService as jest.Mocked<
                typeof serverLogService
            >
            mockServerLogService.logEmbedTemplateChange.mockResolvedValue()

            const response = await request(app)
                .post('/api/guilds/111111111111111111/embeds')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send(requestBody)
                .expect(201)

            expect(response.body).toEqual(responseBody)
            expect(mockEmbedService.createTemplate).toHaveBeenCalledWith(
                '111111111111111111',
                'welcome',
                { title: 'Welcome Embed', color: '#341503' },
                'Welcome template',
                MOCK_SESSION_DATA.userId,
            )
            expect(
                mockServerLogService.logEmbedTemplateChange,
            ).toHaveBeenCalled()
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .post('/api/guilds/111111111111111111/embeds')
                .send({ name: 'test', data: {} })
                .expect(401)

            expect(response.body).toEqual({
                error: 'Not authenticated',
            })
        })
    })

    describe('PATCH /api/guilds/:guildId/embeds/:name', () => {
        test('should update template and log change', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const requestBody = {
                description: 'Updated description',
                embedData: { title: 'Updated Welcome' },
            }
            const responseBody = {
                name: 'welcome',
                description: 'Updated description',
                embedData: { title: 'Updated Welcome', color: '#ff0000' },
            }

            const mockEmbedService = embedBuilderService as jest.Mocked<
                typeof embedBuilderService
            >
            mockEmbedService.validateEmbedData.mockReturnValue({ valid: true })
            mockEmbedService.updateTemplate.mockResolvedValue(responseBody)

            const mockServerLogService = serverLogService as jest.Mocked<
                typeof serverLogService
            >
            mockServerLogService.logEmbedTemplateChange.mockResolvedValue()

            const response = await request(app)
                .patch('/api/guilds/111111111111111111/embeds/welcome')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send(requestBody)
                .expect(200)

            expect(response.body).toEqual(responseBody)
            expect(mockEmbedService.updateTemplate).toHaveBeenCalledWith(
                '111111111111111111',
                'welcome',
                {
                    description: 'Updated description',
                    embedData: { title: 'Updated Welcome' },
                },
            )
            expect(
                mockServerLogService.logEmbedTemplateChange,
            ).toHaveBeenCalled()
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .patch('/api/guilds/111111111111111111/embeds/welcome')
                .send({ title: 'updated' })
                .expect(401)

            expect(response.body).toEqual({
                error: 'Not authenticated',
            })
        })
    })

    describe('DELETE /api/guilds/:guildId/embeds/:name', () => {
        test('should delete template and log change', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockEmbedService = embedBuilderService as jest.Mocked<
                typeof embedBuilderService
            >
            mockEmbedService.deleteTemplate.mockResolvedValue({
                success: true,
            })

            const mockServerLogService = serverLogService as jest.Mocked<
                typeof serverLogService
            >
            mockServerLogService.logEmbedTemplateChange.mockResolvedValue()

            const response = await request(app)
                .delete('/api/guilds/111111111111111111/embeds/welcome')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual({ success: true })
            expect(mockEmbedService.deleteTemplate).toHaveBeenCalledWith(
                '111111111111111111',
                'welcome',
            )
            expect(
                mockServerLogService.logEmbedTemplateChange,
            ).toHaveBeenCalled()
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .delete('/api/guilds/111111111111111111/embeds/welcome')
                .expect(401)

            expect(response.body).toEqual({
                error: 'Not authenticated',
            })
        })
    })
})
