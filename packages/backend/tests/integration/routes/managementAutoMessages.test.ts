import { errorHandler } from '../../../src/middleware/errorHandler'
import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupAutoMessageRoutes } from '../../../src/routes/managementAutoMessages'
import { setupSessionMiddleware } from '../../../src/middleware/session'
import { sessionService } from '../../../src/services/SessionService'
import { MOCK_SESSION_DATA } from '../../fixtures/mock-data'

jest.mock('../../../src/services/SessionService', () => ({
    sessionService: {
        getSession: jest.fn(),
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

describe('Auto Message Routes Integration', () => {
    let app: express.Express

    beforeEach(() => {
        app = express()
        app.use(express.json())
        setupSessionMiddleware(app)
        setupAutoMessageRoutes(app)
        app.use(errorHandler)
        jest.clearAllMocks()
    })

    describe('GET /api/guilds/:guildId/automessages', () => {
        test('should return welcome and leave messages without type query', async () => {
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
                welcome: welcomeMsg,
                leave: leaveMsg,
            })
            expect(
                mockAutoMessageService.getWelcomeMessage,
            ).toHaveBeenCalledWith('111111111111111111')
            expect(mockAutoMessageService.getLeaveMessage).toHaveBeenCalledWith(
                '111111111111111111',
            )
        })

        test('should return messages by type when type query provided', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockAutoMessageService = autoMessageService as jest.Mocked<
                typeof autoMessageService
            >
            const messages = [{ id: '1', type: 'welcome', message: 'Welcome!' }]
            mockAutoMessageService.getMessagesByType.mockResolvedValue(messages)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/automessages?type=welcome')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual({ messages })
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
                .get('/api/guilds/111111111111111111/automessages')
                .expect(401)

            expect(response.body).toEqual({ error: 'Not authenticated' })
        })

        test('should keep legacy /auto-messages path unmapped', async () => {
            const response = await request(app)
                .get('/api/guilds/111111111111111111/auto-messages')
                .expect(404)

            expect(response.body).toEqual({})
        })

        test('should return 500 on service error', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockAutoMessageService = autoMessageService as jest.Mocked<
                typeof autoMessageService
            >
            mockAutoMessageService.getWelcomeMessage.mockRejectedValue(
                new Error('Service error'),
            )

            const response = await request(app)
                .get('/api/guilds/111111111111111111/automessages')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(500)

            expect(response.body).toEqual({
                error: 'Internal server error',
            })
        })
    })

    describe('POST /api/guilds/:guildId/automessages', () => {
        test('should create auto message and log change', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockAutoMessageService = autoMessageService as jest.Mocked<
                typeof autoMessageService
            >
            const newMessage = {
                id: '1',
                type: 'welcome',
                message: 'Welcome!',
            }
            mockAutoMessageService.createMessage.mockResolvedValue(newMessage)

            const response = await request(app)
                .post('/api/guilds/111111111111111111/automessages')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({
                    type: 'welcome',
                    message: 'Welcome!',
                    channelId: '222222222222222222',
                })
                .expect(201)

            expect(response.body).toEqual(newMessage)
            expect(mockAutoMessageService.createMessage).toHaveBeenCalledWith(
                '111111111111111111',
                'welcome',
                { message: 'Welcome!' },
                {
                    channelId: '222222222222222222',
                    trigger: undefined,
                    exactMatch: undefined,
                    cronSchedule: undefined,
                },
            )
            expect(serverLogService.logAutoMessageChange).toHaveBeenCalledWith(
                '111111111111111111',
                'created',
                { type: 'welcome', channelId: '222222222222222222' },
                MOCK_SESSION_DATA.userId,
            )
        })

        test('should return 400 when type or message missing', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const response = await request(app)
                .post('/api/guilds/111111111111111111/automessages')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ type: 'welcome' })
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
                .post('/api/guilds/111111111111111111/automessages')
                .expect(401)

            expect(response.body).toEqual({ error: 'Not authenticated' })
        })

        test('should return 500 on service error', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockAutoMessageService = autoMessageService as jest.Mocked<
                typeof autoMessageService
            >
            mockAutoMessageService.createMessage.mockRejectedValue(
                new Error('Service error'),
            )

            const response = await request(app)
                .post('/api/guilds/111111111111111111/automessages')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ type: 'welcome', message: 'Welcome!' })
                .expect(500)

            expect(response.body).toEqual({
                error: 'Internal server error',
            })
        })
    })

    describe('PATCH /api/guilds/:guildId/automessages/:id', () => {
        test('should update auto message and log change', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockAutoMessageService = autoMessageService as jest.Mocked<
                typeof autoMessageService
            >
            const updatedMessage = {
                id: '1',
                type: 'welcome',
                message: 'Updated!',
            }
            mockAutoMessageService.updateMessage.mockResolvedValue(
                updatedMessage,
            )

            const response = await request(app)
                .patch('/api/guilds/111111111111111111/automessages/1')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ message: 'Updated!' })
                .expect(200)

            expect(response.body).toEqual(updatedMessage)
            expect(mockAutoMessageService.updateMessage).toHaveBeenCalledWith(
                '1',
                { message: 'Updated!' },
            )
            expect(serverLogService.logAutoMessageChange).toHaveBeenCalledWith(
                '111111111111111111',
                'updated',
                { type: 'welcome', changes: { message: 'Updated!' } },
                MOCK_SESSION_DATA.userId,
            )
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .patch('/api/guilds/111111111111111111/automessages/1')
                .expect(401)

            expect(response.body).toEqual({ error: 'Not authenticated' })
        })

        test('should return 500 on service error', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockAutoMessageService = autoMessageService as jest.Mocked<
                typeof autoMessageService
            >
            mockAutoMessageService.updateMessage.mockRejectedValue(
                new Error('Service error'),
            )

            const response = await request(app)
                .patch('/api/guilds/111111111111111111/automessages/1')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ message: 'Updated!' })
                .expect(500)

            expect(response.body).toEqual({
                error: 'Internal server error',
            })
        })
    })

    describe('POST /api/guilds/:guildId/automessages/:id/toggle', () => {
        test('should toggle auto message and log change', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockAutoMessageService = autoMessageService as jest.Mocked<
                typeof autoMessageService
            >
            const toggledMessage = {
                id: '1',
                type: 'welcome',
                enabled: true,
            }
            mockAutoMessageService.toggleMessage.mockResolvedValue(
                toggledMessage,
            )

            const response = await request(app)
                .post('/api/guilds/111111111111111111/automessages/1/toggle')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ enabled: true })
                .expect(200)

            expect(response.body).toEqual(toggledMessage)
            expect(mockAutoMessageService.toggleMessage).toHaveBeenCalledWith(
                '1',
                true,
            )
            expect(serverLogService.logAutoMessageChange).toHaveBeenCalledWith(
                '111111111111111111',
                'enabled',
                { type: 'welcome' },
                MOCK_SESSION_DATA.userId,
            )
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .post('/api/guilds/111111111111111111/automessages/1/toggle')
                .expect(401)

            expect(response.body).toEqual({ error: 'Not authenticated' })
        })

        test('should return 500 on service error', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockAutoMessageService = autoMessageService as jest.Mocked<
                typeof autoMessageService
            >
            mockAutoMessageService.toggleMessage.mockRejectedValue(
                new Error('Service error'),
            )

            const response = await request(app)
                .post('/api/guilds/111111111111111111/automessages/1/toggle')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ enabled: true })
                .expect(500)

            expect(response.body).toEqual({
                error: 'Internal server error',
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
            mockAutoMessageService.deleteMessage.mockResolvedValue(undefined)

            const response = await request(app)
                .delete('/api/guilds/111111111111111111/automessages/1')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual({ success: true })
            expect(mockAutoMessageService.deleteMessage).toHaveBeenCalledWith(
                '1',
            )
            expect(serverLogService.logAutoMessageChange).toHaveBeenCalledWith(
                '111111111111111111',
                'disabled',
                { type: 'deleted' },
                MOCK_SESSION_DATA.userId,
            )
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .delete('/api/guilds/111111111111111111/automessages/1')
                .expect(401)

            expect(response.body).toEqual({ error: 'Not authenticated' })
        })

        test('should return 500 on service error', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockAutoMessageService = autoMessageService as jest.Mocked<
                typeof autoMessageService
            >
            mockAutoMessageService.deleteMessage.mockRejectedValue(
                new Error('Service error'),
            )

            const response = await request(app)
                .delete('/api/guilds/111111111111111111/automessages/1')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(500)

            expect(response.body).toEqual({
                error: 'Internal server error',
            })
        })
    })
})
