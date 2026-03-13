import { errorHandler } from '../../../src/middleware/errorHandler'
import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupManagementRoutes } from '../../../src/routes/management'
import { setupSessionMiddleware } from '../../../src/middleware/session'
import { sessionService } from '../../../src/services/SessionService'
import { MOCK_SESSION_DATA } from '../../fixtures/mock-data'

jest.mock('../../../src/services/SessionService', () => ({
    sessionService: {
        getSession: jest.fn(),
    },
}))

jest.mock('@lucky/shared/services', () => ({
    AutoModTemplateNotFoundError: class AutoModTemplateNotFoundError extends Error {
        readonly code = 'ERR_AUTOMOD_TEMPLATE_NOT_FOUND'

        constructor(templateId: string) {
            super(`Auto-mod template not found: ${templateId}`)
            this.name = 'AutoModTemplateNotFoundError'
        }
    },
    autoModService: {
        getSettings: jest.fn(),
        updateSettings: jest.fn(),
        listTemplates: jest.fn(),
        applyTemplate: jest.fn(),
    },
    customCommandService: {
        listCommands: jest.fn(),
        createCommand: jest.fn(),
        updateCommand: jest.fn(),
        deleteCommand: jest.fn(),
    },
    serverLogService: {
        getRecentLogs: jest.fn(),
        getLogsByType: jest.fn(),
        searchLogs: jest.fn(),
        getUserLogs: jest.fn(),
        getStats: jest.fn(),
        logAutoModSettingsChange: jest.fn(),
        logCustomCommandChange: jest.fn(),
    },
}))

jest.mock('../../../src/routes/managementEmbeds', () => ({
    setupEmbedRoutes: jest.fn(),
}))

jest.mock('../../../src/routes/managementAutoMessages', () => ({
    setupAutoMessageRoutes: jest.fn(),
}))

import {
    AutoModTemplateNotFoundError,
    autoModService,
    customCommandService,
    serverLogService,
} from '@lucky/shared/services'

describe('Management Routes Integration', () => {
    let app: express.Express

    beforeEach(() => {
        app = express()
        app.use(express.json())
        setupSessionMiddleware(app)
        setupManagementRoutes(app)
        app.use(errorHandler)
        jest.clearAllMocks()
    })

    describe('GET /api/guilds/:guildId/automod/settings', () => {
        test('should return automod settings when authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockSettings = {
                enabled: true,
                spamProtection: true,
                linkProtection: false,
            }

            const mockAutoModService = autoModService as jest.Mocked<
                typeof autoModService
            >
            mockAutoModService.getSettings.mockResolvedValue(mockSettings)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/automod/settings')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual(mockSettings)
            expect(mockAutoModService.getSettings).toHaveBeenCalledWith(
                '111111111111111111',
            )
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/automod/settings')
                .expect(401)

            expect(response.body).toEqual({
                error: 'Not authenticated',
            })
        })

        test('should return 500 on service error', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockAutoModService = autoModService as jest.Mocked<
                typeof autoModService
            >
            mockAutoModService.getSettings.mockRejectedValue(
                new Error('Service error'),
            )

            const response = await request(app)
                .get('/api/guilds/111111111111111111/automod/settings')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(500)

            expect(response.body).toEqual({
                error: 'Internal server error',
            })
        })
    })

    describe('PATCH /api/guilds/:guildId/automod/settings', () => {
        test('should update automod settings and log change', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const updatedSettings = {
                enabled: false,
                spamEnabled: true,
            }

            const mockAutoModService = autoModService as jest.Mocked<
                typeof autoModService
            >
            mockAutoModService.updateSettings.mockResolvedValue(updatedSettings)

            const mockServerLogService = serverLogService as jest.Mocked<
                typeof serverLogService
            >
            mockServerLogService.logAutoModSettingsChange.mockResolvedValue()

            const response = await request(app)
                .patch('/api/guilds/111111111111111111/automod/settings')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send(updatedSettings)
                .expect(200)

            expect(response.body).toEqual(updatedSettings)
            expect(mockAutoModService.updateSettings).toHaveBeenCalledWith(
                '111111111111111111',
                updatedSettings,
            )
            expect(
                mockServerLogService.logAutoModSettingsChange,
            ).toHaveBeenCalledWith(
                '111111111111111111',
                {
                    module: 'general',
                    enabled: true,
                    changes: updatedSettings,
                },
                MOCK_SESSION_DATA.userId,
            )
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .patch('/api/guilds/111111111111111111/automod/settings')
                .send({ enabled: false })
                .expect(401)

            expect(response.body).toEqual({
                error: 'Not authenticated',
            })
        })

        test('should return 500 on service error', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockAutoModService = autoModService as jest.Mocked<
                typeof autoModService
            >
            mockAutoModService.updateSettings.mockRejectedValue(
                new Error('Service error'),
            )

            const response = await request(app)
                .patch('/api/guilds/111111111111111111/automod/settings')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ enabled: false })
                .expect(500)

            expect(response.body).toEqual({
                error: 'Internal server error',
            })
        })
    })

    describe('Auto-mod templates routes', () => {
        test('GET /api/guilds/:guildId/automod/templates returns templates', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockAutoModService = autoModService as jest.Mocked<
                typeof autoModService
            >
            mockAutoModService.listTemplates.mockResolvedValue([
                {
                    id: 'balanced',
                    name: 'Balanced',
                    description: 'Balanced defaults',
                    settings: { enabled: true },
                },
            ])

            const response = await request(app)
                .get('/api/guilds/111111111111111111/automod/templates')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual({
                templates: [
                    {
                        id: 'balanced',
                        name: 'Balanced',
                        description: 'Balanced defaults',
                        settings: { enabled: true },
                    },
                ],
            })
        })

        test('POST /api/guilds/:guildId/automod/templates/:templateId/apply applies template', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockAutoModService = autoModService as jest.Mocked<
                typeof autoModService
            >
            mockAutoModService.applyTemplate.mockResolvedValue({
                template: {
                    id: 'balanced',
                },
                settings: {
                    guildId: '111111111111111111',
                    enabled: true,
                },
            } as any)
            const mockServerLogService = serverLogService as jest.Mocked<
                typeof serverLogService
            >
            mockServerLogService.logAutoModSettingsChange.mockResolvedValue()

            const response = await request(app)
                .post(
                    '/api/guilds/111111111111111111/automod/templates/balanced/apply',
                )
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(mockAutoModService.applyTemplate).toHaveBeenCalledWith(
                '111111111111111111',
                'balanced',
            )
            expect(
                mockServerLogService.logAutoModSettingsChange,
            ).toHaveBeenCalledWith(
                '111111111111111111',
                {
                    module: 'general',
                    enabled: true,
                    changes: {
                        templateId: 'balanced',
                        settings: {
                            guildId: '111111111111111111',
                            enabled: true,
                        },
                    },
                },
                MOCK_SESSION_DATA.userId,
            )
            expect(response.body).toEqual({
                templateId: 'balanced',
                settings: {
                    guildId: '111111111111111111',
                    enabled: true,
                },
            })
        })

        test('POST /api/guilds/:guildId/automod/templates/:templateId/apply returns 404 for unknown template', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockAutoModService = autoModService as jest.Mocked<
                typeof autoModService
            >
            mockAutoModService.applyTemplate.mockRejectedValue(
                new AutoModTemplateNotFoundError('unknown'),
            )

            const response = await request(app)
                .post('/api/guilds/111111111111111111/automod/templates/unknown/apply')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(404)

            expect(response.body).toEqual({
                error: 'Auto-mod template not found',
            })
        })
    })

    describe('GET /api/guilds/:guildId/commands', () => {
        test('should return custom commands when authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockCommands = [
                { name: 'hello', response: 'Hi there!' },
                { name: 'bye', response: 'Goodbye!' },
            ]

            const mockCustomCommandService =
                customCommandService as jest.Mocked<typeof customCommandService>
            mockCustomCommandService.listCommands.mockResolvedValue(
                mockCommands,
            )

            const response = await request(app)
                .get('/api/guilds/111111111111111111/commands')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual({ commands: mockCommands })
            expect(mockCustomCommandService.listCommands).toHaveBeenCalledWith(
                '111111111111111111',
            )
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/commands')
                .expect(401)

            expect(response.body).toEqual({
                error: 'Not authenticated',
            })
        })

        test('should return 500 on service error', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockCustomCommandService =
                customCommandService as jest.Mocked<typeof customCommandService>
            mockCustomCommandService.listCommands.mockRejectedValue(
                new Error('Service error'),
            )

            const response = await request(app)
                .get('/api/guilds/111111111111111111/commands')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(500)

            expect(response.body).toEqual({
                error: 'Internal server error',
            })
        })
    })

    describe('POST /api/guilds/:guildId/commands', () => {
        test('should create custom command and log change', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const newCommand = {
                name: 'test',
                response: 'Test response',
                description: 'A test command',
            }

            const mockCustomCommandService =
                customCommandService as jest.Mocked<typeof customCommandService>
            mockCustomCommandService.createCommand.mockResolvedValue(newCommand)

            const mockServerLogService = serverLogService as jest.Mocked<
                typeof serverLogService
            >
            mockServerLogService.logCustomCommandChange.mockResolvedValue()

            const response = await request(app)
                .post('/api/guilds/111111111111111111/commands')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send(newCommand)
                .expect(201)

            expect(response.body).toEqual(newCommand)
            expect(mockCustomCommandService.createCommand).toHaveBeenCalledWith(
                '111111111111111111',
                'test',
                'Test response',
                {
                    description: 'A test command',
                    createdBy: MOCK_SESSION_DATA.userId,
                },
            )
            expect(
                mockServerLogService.logCustomCommandChange,
            ).toHaveBeenCalledWith(
                '111111111111111111',
                'created',
                { commandName: 'test' },
                MOCK_SESSION_DATA.userId,
            )
        })

        test('should return 400 when name is missing', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const response = await request(app)
                .post('/api/guilds/111111111111111111/commands')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ response: 'Test response' })
                .expect(400)

            expect(response.body).toEqual({
                error: 'Validation failed',
                errors: expect.any(Array),
            })
        })

        test('should return 400 when response is missing', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const response = await request(app)
                .post('/api/guilds/111111111111111111/commands')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ name: 'test' })
                .expect(400)

            expect(response.body).toEqual({
                error: 'Validation failed',
                errors: expect.any(Array),
            })
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .post('/api/guilds/111111111111111111/commands')
                .send({ name: 'test', response: 'Test response' })
                .expect(401)

            expect(response.body).toEqual({
                error: 'Not authenticated',
            })
        })

        test('should return 500 on service error', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockCustomCommandService =
                customCommandService as jest.Mocked<typeof customCommandService>
            mockCustomCommandService.createCommand.mockRejectedValue(
                new Error('Service error'),
            )

            const response = await request(app)
                .post('/api/guilds/111111111111111111/commands')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ name: 'test', response: 'Test response' })
                .expect(500)

            expect(response.body).toEqual({
                error: 'Internal server error',
            })
        })
    })

    describe('PATCH /api/guilds/:guildId/commands/:name', () => {
        test('should update custom command and log change', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const updatedCommand = {
                name: 'test',
                response: 'Updated response',
            }

            const mockCustomCommandService =
                customCommandService as jest.Mocked<typeof customCommandService>
            mockCustomCommandService.updateCommand.mockResolvedValue(
                updatedCommand,
            )

            const mockServerLogService = serverLogService as jest.Mocked<
                typeof serverLogService
            >
            mockServerLogService.logCustomCommandChange.mockResolvedValue()

            const response = await request(app)
                .patch('/api/guilds/111111111111111111/commands/test')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ response: 'Updated response' })
                .expect(200)

            expect(response.body).toEqual(updatedCommand)
            expect(mockCustomCommandService.updateCommand).toHaveBeenCalledWith(
                '111111111111111111',
                'test',
                {
                    response: 'Updated response',
                },
            )
            expect(
                mockServerLogService.logCustomCommandChange,
            ).toHaveBeenCalledWith(
                '111111111111111111',
                'updated',
                {
                    commandName: 'test',
                    changes: { response: 'Updated response' },
                },
                MOCK_SESSION_DATA.userId,
            )
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .patch('/api/guilds/111111111111111111/commands/test')
                .send({ response: 'Updated response' })
                .expect(401)

            expect(response.body).toEqual({
                error: 'Not authenticated',
            })
        })

        test('should return 500 on service error', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockCustomCommandService =
                customCommandService as jest.Mocked<typeof customCommandService>
            mockCustomCommandService.updateCommand.mockRejectedValue(
                new Error('Service error'),
            )

            const response = await request(app)
                .patch('/api/guilds/111111111111111111/commands/test')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ response: 'Updated response' })
                .expect(500)

            expect(response.body).toEqual({
                error: 'Internal server error',
            })
        })
    })

    describe('DELETE /api/guilds/:guildId/commands/:name', () => {
        test('should delete custom command and log change', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockCustomCommandService =
                customCommandService as jest.Mocked<typeof customCommandService>
            mockCustomCommandService.deleteCommand.mockResolvedValue()

            const mockServerLogService = serverLogService as jest.Mocked<
                typeof serverLogService
            >
            mockServerLogService.logCustomCommandChange.mockResolvedValue()

            const response = await request(app)
                .delete('/api/guilds/111111111111111111/commands/test')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual({ success: true })
            expect(mockCustomCommandService.deleteCommand).toHaveBeenCalledWith(
                '111111111111111111',
                'test',
            )
            expect(
                mockServerLogService.logCustomCommandChange,
            ).toHaveBeenCalledWith(
                '111111111111111111',
                'deleted',
                { commandName: 'test' },
                MOCK_SESSION_DATA.userId,
            )
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .delete('/api/guilds/111111111111111111/commands/test')
                .expect(401)

            expect(response.body).toEqual({
                error: 'Not authenticated',
            })
        })

        test('should return 500 on service error', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockCustomCommandService =
                customCommandService as jest.Mocked<typeof customCommandService>
            mockCustomCommandService.deleteCommand.mockRejectedValue(
                new Error('Service error'),
            )

            const response = await request(app)
                .delete('/api/guilds/111111111111111111/commands/test')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(500)

            expect(response.body).toEqual({
                error: 'Internal server error',
            })
        })
    })

    describe('GET /api/guilds/:guildId/logs', () => {
        test('should return recent logs when authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockLogs = [
                { id: 1, type: 'info', message: 'Test log' },
                { id: 2, type: 'warn', message: 'Warning log' },
            ]

            const mockServerLogService = serverLogService as jest.Mocked<
                typeof serverLogService
            >
            mockServerLogService.getRecentLogs.mockResolvedValue(mockLogs)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/logs')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual({ logs: mockLogs })
            expect(mockServerLogService.getRecentLogs).toHaveBeenCalledWith(
                '111111111111111111',
                50,
            )
        })

        test('should return logs by type when type param provided', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockLogs = [{ id: 1, type: 'error', message: 'Error log' }]

            const mockServerLogService = serverLogService as jest.Mocked<
                typeof serverLogService
            >
            mockServerLogService.getLogsByType.mockResolvedValue(mockLogs)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/logs?type=error')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual({ logs: mockLogs })
            expect(mockServerLogService.getLogsByType).toHaveBeenCalledWith(
                '111111111111111111',
                'error',
                50,
            )
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/logs')
                .expect(401)

            expect(response.body).toEqual({
                error: 'Not authenticated',
            })
        })

        test('should return 500 on service error', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockServerLogService = serverLogService as jest.Mocked<
                typeof serverLogService
            >
            mockServerLogService.getRecentLogs.mockRejectedValue(
                new Error('Service error'),
            )

            const response = await request(app)
                .get('/api/guilds/111111111111111111/logs')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(500)

            expect(response.body).toEqual({
                error: 'Internal server error',
            })
        })
    })

    describe('GET /api/guilds/:guildId/logs/search', () => {
        test('should search logs when authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockLogs = [{ id: 1, type: 'info', message: 'Search result' }]

            const mockServerLogService = serverLogService as jest.Mocked<
                typeof serverLogService
            >
            mockServerLogService.searchLogs.mockResolvedValue(mockLogs)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/logs/search?q=test')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual({ logs: mockLogs })
            expect(mockServerLogService.searchLogs).toHaveBeenCalledWith(
                '111111111111111111',
                {
                    type: undefined,
                    userId: undefined,
                },
            )
        })

        test('should return 400 when query param is missing', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/logs/search')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(400)

            expect(response.body).toEqual({
                error: 'Validation failed',
                errors: expect.any(Array),
            })
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/logs/search?q=test')
                .expect(401)

            expect(response.body).toEqual({
                error: 'Not authenticated',
            })
        })

        test('should return 500 on service error', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockServerLogService = serverLogService as jest.Mocked<
                typeof serverLogService
            >
            mockServerLogService.searchLogs.mockRejectedValue(
                new Error('Service error'),
            )

            const response = await request(app)
                .get('/api/guilds/111111111111111111/logs/search?q=test')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(500)

            expect(response.body).toEqual({
                error: 'Internal server error',
            })
        })
    })

    describe('GET /api/guilds/:guildId/logs/users/:userId', () => {
        test('should return user logs when authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockLogs = [
                { id: 1, userId: '123456789012345678', message: 'User log' },
            ]

            const mockServerLogService = serverLogService as jest.Mocked<
                typeof serverLogService
            >
            mockServerLogService.getUserLogs.mockResolvedValue(mockLogs)

            const response = await request(app)
                .get(
                    '/api/guilds/111111111111111111/logs/users/123456789012345678',
                )
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual({ logs: mockLogs })
            expect(mockServerLogService.getUserLogs).toHaveBeenCalledWith(
                '111111111111111111',
                '123456789012345678',
            )
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .get(
                    '/api/guilds/111111111111111111/logs/users/123456789012345678',
                )
                .expect(401)

            expect(response.body).toEqual({
                error: 'Not authenticated',
            })
        })

        test('should return 500 on service error', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockServerLogService = serverLogService as jest.Mocked<
                typeof serverLogService
            >
            mockServerLogService.getUserLogs.mockRejectedValue(
                new Error('Service error'),
            )

            const response = await request(app)
                .get(
                    '/api/guilds/111111111111111111/logs/users/123456789012345678',
                )
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(500)

            expect(response.body).toEqual({
                error: 'Internal server error',
            })
        })
    })

    describe('GET /api/guilds/:guildId/logs/stats', () => {
        test('should return log stats when authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockStats = {
                total: 100,
                byType: { info: 50, warn: 30, error: 20 },
            }

            const mockServerLogService = serverLogService as jest.Mocked<
                typeof serverLogService
            >
            mockServerLogService.getStats.mockResolvedValue(mockStats)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/logs/stats')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual(mockStats)
            expect(mockServerLogService.getStats).toHaveBeenCalledWith(
                '111111111111111111',
            )
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/logs/stats')
                .expect(401)

            expect(response.body).toEqual({
                error: 'Not authenticated',
            })
        })

        test('should return 500 on service error', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockServerLogService = serverLogService as jest.Mocked<
                typeof serverLogService
            >
            mockServerLogService.getStats.mockRejectedValue(
                new Error('Service error'),
            )

            const response = await request(app)
                .get('/api/guilds/111111111111111111/logs/stats')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(500)

            expect(response.body).toEqual({
                error: 'Internal server error',
            })
        })
    })
})
