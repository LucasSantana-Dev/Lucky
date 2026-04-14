import { errorHandler } from '../../../src/middleware/errorHandler'
import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupAutoMessageRoutes } from '../../../src/routes/managementAutoMessages'
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
    autoMessageService: {
        getMessagesByType: jest.fn(),
        getWelcomeMessage: jest.fn(),
        getLeaveMessage: jest.fn(),
        createMessage: jest.fn(),
        updateMessage: jest.fn(),
        toggleMessage: jest.fn(),
        deleteMessage: jest.fn(),
    },
    serverLogService: {
        logAutoMessageChange: jest.fn(),
    },
}))

import { autoMessageService, serverLogService } from '@lucky/shared/services'
import { guildAccessService } from '../../../src/services/GuildAccessService'

describe('Auto Message Routes Integration', () => {
    let app: express.Express

    beforeEach(() => {
        app = express()
        app.use(express.json())
        setupSessionMiddleware(app)
        setupAutoMessageRoutes(app)
        app.use(errorHandler)
        jest.clearAllMocks()

        const mockGuildAccessService = guildAccessService as jest.Mocked<
            typeof guildAccessService
        >
        mockGuildAccessService.resolveGuildContext.mockResolvedValue(
            MOCK_GUILD_CONTEXT,
        )
        mockGuildAccessService.hasAccess.mockReturnValue(true)
    })

    describe('GET /api/guilds/:guildId/automessages', () => {
        test('should return unified messages payload without type query', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockAutoMessageService = autoMessageService as jest.Mocked<
                typeof autoMessageService
            >
            const welcomeMsg = {
                id: '1',
                type: 'welcome',
                message: 'Welcome!',
            }
            const leaveMsg = { id: '2', type: 'leave', message: 'Goodbye!' }
            mockAutoMessageService.getWelcomeMessage.mockResolvedValue(
                welcomeMsg,
            )
            mockAutoMessageService.getLeaveMessage.mockResolvedValue(leaveMsg)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/automessages')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual({
                messages: [welcomeMsg, leaveMsg],
            })
            expect(
                mockAutoMessageService.getWelcomeMessage,
            ).toHaveBeenCalledWith('111111111111111111')
            expect(mockAutoMessageService.getLeaveMessage).toHaveBeenCalledWith(
                '111111111111111111',
            )
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/automessages')
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
                .get('/api/guilds/111111111111111111/automessages')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(403)

            expect(response.body).toEqual({
                error: 'No access to this server',
            })
        })
    })

    describe('GET /api/guilds/:guildId/automessages?type=welcome', () => {
        test('should return welcome message when type query is provided', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockAutoMessageService = autoMessageService as jest.Mocked<
                typeof autoMessageService
            >
            const welcomeMsg = {
                id: '1',
                type: 'welcome',
                message: 'Welcome!',
            }
            mockAutoMessageService.getMessagesByType.mockResolvedValue(
                welcomeMsg,
            )

            const response = await request(app)
                .get('/api/guilds/111111111111111111/automessages?type=welcome')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual(welcomeMsg)
            expect(
                mockAutoMessageService.getMessagesByType,
            ).toHaveBeenCalledWith('111111111111111111', 'welcome')
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/automessages?type=welcome')
                .expect(401)

            expect(response.body).toEqual({
                error: 'Not authenticated',
            })
        })
    })

    describe('POST /api/guilds/:guildId/automessages', () => {
        test('should create auto message and log change', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const newMsg = {
                type: 'welcome',
                message: 'Welcome to the server!',
                enabled: true,
            }

            const mockAutoMessageService = autoMessageService as jest.Mocked<
                typeof autoMessageService
            >
            mockAutoMessageService.createMessage.mockResolvedValue(newMsg)

            const mockServerLogService = serverLogService as jest.Mocked<
                typeof serverLogService
            >
            mockServerLogService.logAutoMessageChange.mockResolvedValue()

            const response = await request(app)
                .post('/api/guilds/111111111111111111/automessages')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send(newMsg)
                .expect(201)

            expect(response.body).toEqual(newMsg)
            expect(mockAutoMessageService.createMessage).toHaveBeenCalledWith(
                '111111111111111111',
                newMsg,
            )
            expect(
                mockServerLogService.logAutoMessageChange,
            ).toHaveBeenCalled()
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .post('/api/guilds/111111111111111111/automessages')
                .send({ type: 'welcome', message: 'test' })
                .expect(401)

            expect(response.body).toEqual({
                error: 'Not authenticated',
            })
        })
    })

    describe('PATCH /api/guilds/:guildId/automessages/:id', () => {
        test('should update auto message and log change', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const updatedMsg = {
                type: 'welcome',
                message: 'Updated welcome message!',
                enabled: true,
            }

            const mockAutoMessageService = autoMessageService as jest.Mocked<
                typeof autoMessageService
            >
            mockAutoMessageService.updateMessage.mockResolvedValue(updatedMsg)

            const mockServerLogService = serverLogService as jest.Mocked<
                typeof serverLogService
            >
            mockServerLogService.logAutoMessageChange.mockResolvedValue()

            const response = await request(app)
                .patch('/api/guilds/111111111111111111/automessages/1')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send(updatedMsg)
                .expect(200)

            expect(response.body).toEqual(updatedMsg)
            expect(mockAutoMessageService.updateMessage).toHaveBeenCalledWith(
                '111111111111111111',
                '1',
                updatedMsg,
            )
            expect(
                mockServerLogService.logAutoMessageChange,
            ).toHaveBeenCalled()
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .patch('/api/guilds/111111111111111111/automessages/1')
                .send({ message: 'updated' })
                .expect(401)

            expect(response.body).toEqual({
                error: 'Not authenticated',
            })
        })
    })

    describe('POST /api/guilds/:guildId/automessages/:id/toggle', () => {
        test('should toggle auto message and log change', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const toggledMessage = {
                type: 'welcome',
                message: 'Welcome!',
                enabled: false,
            }

            const mockAutoMessageService = autoMessageService as jest.Mocked<
                typeof autoMessageService
            >
            mockAutoMessageService.toggleMessage.mockResolvedValue(
                toggledMessage,
            )

            const mockServerLogService = serverLogService as jest.Mocked<
                typeof serverLogService
            >
            mockServerLogService.logAutoMessageChange.mockResolvedValue()

            const response = await request(app)
                .post('/api/guilds/111111111111111111/automessages/1/toggle')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ enabled: true })
                .expect(200)

            expect(response.body).toEqual(toggledMessage)
            expect(mockAutoMessageService.toggleMessage).toHaveBeenCalledWith(
                '111111111111111111',
                '1',
            )
            expect(
                mockServerLogService.logAutoMessageChange,
            ).toHaveBeenCalled()
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .post('/api/guilds/111111111111111111/automessages/1/toggle')
                .send({ enabled: true })
                .expect(401)

            expect(response.body).toEqual({
                error: 'Not authenticated',
            })
        })
    })

    describe('DELETE /api/guilds/:guildId/automessages/:id', () => {
        test('should delete auto message and log change', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockAutoMessageService = autoMessageService as jest.Mocked<
                typeof autoMessageService
            >
            mockAutoMessageService.deleteMessage.mockResolvedValue({
                success: true,
            })

            const mockServerLogService = serverLogService as jest.Mocked<
                typeof serverLogService
            >
            mockServerLogService.logAutoMessageChange.mockResolvedValue()

            const response = await request(app)
                .delete('/api/guilds/111111111111111111/automessages/1')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual({ success: true })
            expect(mockAutoMessageService.deleteMessage).toHaveBeenCalledWith(
                '111111111111111111',
                '1',
            )
            expect(
                mockServerLogService.logAutoMessageChange,
            ).toHaveBeenCalled()
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .delete('/api/guilds/111111111111111111/automessages/1')
                .expect(401)

            expect(response.body).toEqual({
                error: 'Not authenticated',
            })
        })
    })
})
