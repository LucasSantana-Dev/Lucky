import { errorHandler } from '../../../src/middleware/errorHandler'
import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupEmbedRoutes } from '../../../src/routes/managementEmbeds'
import { setupSessionMiddleware } from '../../../src/middleware/session'
import { sessionService } from '../../../src/services/SessionService'
import { MOCK_SESSION_DATA } from '../../fixtures/mock-data'

jest.mock('../../../src/services/SessionService', () => ({
    sessionService: {
        getSession: jest.fn(),
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

describe('Embed Management Routes Integration', () => {
    let app: express.Express

    beforeEach(() => {
        app = express()
        app.use(express.json())
        setupSessionMiddleware(app)
        setupEmbedRoutes(app)
        app.use(errorHandler)
        jest.clearAllMocks()
    })

    describe('GET /api/guilds/:guildId/embeds', () => {
        test('should return templates list when authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockTemplates = [
                {
                    id: 1,
                    guildId: '111111111111111111',
                    name: 'welcome',
                    embedData: { title: 'Welcome' },
                    description: 'Welcome message',
                },
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

            expect(response.body).toEqual({ error: 'Not authenticated' })
        })

        test('should return 500 on service error', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockEmbedService = embedBuilderService as jest.Mocked<
                typeof embedBuilderService
            >
            mockEmbedService.listTemplates.mockRejectedValue(
                new Error('Database error'),
            )

            const response = await request(app)
                .get('/api/guilds/111111111111111111/embeds')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(500)

            expect(response.body).toEqual({
                error: 'Internal server error',
            })
        })
    })

    describe('POST /api/guilds/:guildId/embeds', () => {
        test('should create template when data is valid', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const embedData = { title: 'New Embed', description: 'Test' }
            const mockTemplate = {
                id: 1,
                guildId: '111111111111111111',
                name: 'announcement',
                embedData,
                description: 'Announcement template',
            }

            const mockEmbedService = embedBuilderService as jest.Mocked<
                typeof embedBuilderService
            >
            mockEmbedService.validateEmbedData.mockReturnValue({ valid: true })
            mockEmbedService.createTemplate.mockResolvedValue(mockTemplate)

            const mockLogService = serverLogService as jest.Mocked<
                typeof serverLogService
            >
            mockLogService.logEmbedTemplateChange.mockResolvedValue(undefined)

            const response = await request(app)
                .post('/api/guilds/111111111111111111/embeds')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({
                    name: 'announcement',
                    embedData,
                    description: 'Announcement template',
                })
                .expect(201)

            expect(response.body).toEqual(mockTemplate)
            expect(mockEmbedService.validateEmbedData).toHaveBeenCalledWith(
                embedData,
            )
            expect(mockEmbedService.createTemplate).toHaveBeenCalledWith(
                '111111111111111111',
                'announcement',
                embedData,
                'Announcement template',
                MOCK_SESSION_DATA.userId,
            )
            expect(mockLogService.logEmbedTemplateChange).toHaveBeenCalledWith(
                '111111111111111111',
                'created',
                { templateName: 'announcement' },
                MOCK_SESSION_DATA.userId,
            )
        })

        test('should return 400 when name is missing', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const response = await request(app)
                .post('/api/guilds/111111111111111111/embeds')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ embedData: { title: 'Test' } })
                .expect(400)

            expect(response.body).toEqual({
                error: 'Validation failed',
                errors: expect.any(Array),
            })
        })

        test('should return 400 when embedData is missing', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const response = await request(app)
                .post('/api/guilds/111111111111111111/embeds')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ name: 'test' })
                .expect(400)

            expect(response.body).toEqual({
                error: 'Validation failed',
                errors: expect.any(Array),
            })
        })

        test('should return 400 when embedData is invalid', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const invalidEmbedData = { title: '' }
            const mockEmbedService = embedBuilderService as jest.Mocked<
                typeof embedBuilderService
            >
            mockEmbedService.validateEmbedData.mockReturnValue({
                valid: false,
                errors: ['Title cannot be empty'],
            })

            const response = await request(app)
                .post('/api/guilds/111111111111111111/embeds')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ name: 'test', embedData: invalidEmbedData })
                .expect(400)

            expect(response.body).toEqual({
                error: 'Invalid embed data',
                details: ['Title cannot be empty'],
            })
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .post('/api/guilds/111111111111111111/embeds')
                .send({ name: 'test', embedData: { title: 'Test' } })
                .expect(401)

            expect(response.body).toEqual({ error: 'Not authenticated' })
        })

        test('should return 500 on service error', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const embedData = { title: 'Test' }
            const mockEmbedService = embedBuilderService as jest.Mocked<
                typeof embedBuilderService
            >
            mockEmbedService.validateEmbedData.mockReturnValue({ valid: true })
            mockEmbedService.createTemplate.mockRejectedValue(
                new Error('Database error'),
            )

            const response = await request(app)
                .post('/api/guilds/111111111111111111/embeds')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ name: 'test', embedData })
                .expect(500)

            expect(response.body).toEqual({
                error: 'Internal server error',
            })
        })
    })

    describe('PATCH /api/guilds/:guildId/embeds/:name', () => {
        test('should update template and log change', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const updatedTemplate = {
                id: 1,
                guildId: '111111111111111111',
                name: 'welcome',
                embedData: { title: 'Updated Welcome' },
                description: 'Updated description',
            }

            const mockEmbedService = embedBuilderService as jest.Mocked<
                typeof embedBuilderService
            >
            mockEmbedService.updateTemplate.mockResolvedValue(updatedTemplate)

            const mockLogService = serverLogService as jest.Mocked<
                typeof serverLogService
            >
            mockLogService.logEmbedTemplateChange.mockResolvedValue(undefined)

            const response = await request(app)
                .patch('/api/guilds/111111111111111111/embeds/welcome')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ embedData: { title: 'Updated Welcome' } })
                .expect(200)

            expect(response.body).toEqual(updatedTemplate)
            expect(mockEmbedService.updateTemplate).toHaveBeenCalledWith(
                '111111111111111111',
                'welcome',
                { embedData: { title: 'Updated Welcome' } },
            )
            expect(mockLogService.logEmbedTemplateChange).toHaveBeenCalledWith(
                '111111111111111111',
                'updated',
                { templateName: 'welcome' },
                MOCK_SESSION_DATA.userId,
            )
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .patch('/api/guilds/111111111111111111/embeds/welcome')
                .send({ embedData: { title: 'Updated' } })
                .expect(401)

            expect(response.body).toEqual({ error: 'Not authenticated' })
        })

        test('should return 500 on service error', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockEmbedService = embedBuilderService as jest.Mocked<
                typeof embedBuilderService
            >
            mockEmbedService.updateTemplate.mockRejectedValue(
                new Error('Database error'),
            )

            const response = await request(app)
                .patch('/api/guilds/111111111111111111/embeds/welcome')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ embedData: { title: 'Updated' } })
                .expect(500)

            expect(response.body).toEqual({
                error: 'Internal server error',
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
            mockEmbedService.deleteTemplate.mockResolvedValue(undefined)

            const mockLogService = serverLogService as jest.Mocked<
                typeof serverLogService
            >
            mockLogService.logEmbedTemplateChange.mockResolvedValue(undefined)

            const response = await request(app)
                .delete('/api/guilds/111111111111111111/embeds/welcome')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual({ success: true })
            expect(mockEmbedService.deleteTemplate).toHaveBeenCalledWith(
                '111111111111111111',
                'welcome',
            )
            expect(mockLogService.logEmbedTemplateChange).toHaveBeenCalledWith(
                '111111111111111111',
                'deleted',
                { templateName: 'welcome' },
                MOCK_SESSION_DATA.userId,
            )
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .delete('/api/guilds/111111111111111111/embeds/welcome')
                .expect(401)

            expect(response.body).toEqual({ error: 'Not authenticated' })
        })

        test('should return 500 on service error', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockEmbedService = embedBuilderService as jest.Mocked<
                typeof embedBuilderService
            >
            mockEmbedService.deleteTemplate.mockRejectedValue(
                new Error('Database error'),
            )

            const response = await request(app)
                .delete('/api/guilds/111111111111111111/embeds/welcome')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(500)

            expect(response.body).toEqual({
                error: 'Internal server error',
            })
        })
    })
})
