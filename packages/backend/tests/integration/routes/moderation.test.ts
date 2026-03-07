import { errorHandler } from '../../../src/middleware/errorHandler'
import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupModerationRoutes } from '../../../src/routes/moderation'
import { setupSessionMiddleware } from '../../../src/middleware/session'
import { sessionService } from '../../../src/services/SessionService'
import { MOCK_SESSION_DATA } from '../../fixtures/mock-data'

jest.mock('../../../src/services/SessionService', () => ({
    sessionService: {
        getSession: jest.fn(),
    },
}))

jest.mock('@lukbot/shared/services', () => ({
    redisClient: {
        isHealthy: jest.fn(() => true),
        get: jest.fn(),
        set: jest.fn(),
        setex: jest.fn(),
        del: jest.fn(),
        ping: jest.fn(() => Promise.resolve('PONG')),
    },
    featureToggleService: {
        isEnabledGlobal: jest.fn(() => true),
        isEnabledForGuild: jest.fn(() => true),
    },
    moderationService: {
        createCase: jest.fn(),
        getCase: jest.fn(),
        getRecentCases: jest.fn(),
        getUserCases: jest.fn(),
        deactivateCase: jest.fn(),
        getSettings: jest.fn(),
        updateSettings: jest.fn(),
        getStats: jest.fn(),
    },
    autoModService: { getSettings: jest.fn() },
    customCommandService: { getCommand: jest.fn() },
    autoMessageService: { getWelcomeMessage: jest.fn() },
    serverLogService: {
        createLog: jest.fn(),
        logCaseUpdate: jest.fn(),
        logSettingsChange: jest.fn(),
    },
    embedBuilderService: {},
    musicControlService: {},
}))

import { moderationService, serverLogService } from '@lukbot/shared/services'

describe('Moderation Routes Integration', () => {
    let app: express.Express

    beforeEach(() => {
        app = express()
        app.use(express.json())
        setupSessionMiddleware(app)
        setupModerationRoutes(app)
        app.use(errorHandler)
        jest.clearAllMocks()
    })

    describe('GET /api/guilds/:guildId/moderation/cases', () => {
        test('should return recent cases with default limit', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockCases = [
                {
                    id: 'case1',
                    guildId: '111111111111111111',
                    caseNumber: 1,
                    userId: '123456789012345678',
                    moderatorId: '987654321098765432',
                    action: 'ban',
                    reason: 'Spam',
                    active: true,
                },
            ]

            const mockModerationService = moderationService as jest.Mocked<
                typeof moderationService
            >
            mockModerationService.getRecentCases.mockResolvedValue(mockCases)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/moderation/cases')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)
            expect(response.body).toEqual({ cases: mockCases })
            expect(mockModerationService.getRecentCases).toHaveBeenCalledWith(
                '111111111111111111',
                25,
            )
        })

        test('should return recent cases with custom limit', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockModerationService = moderationService as jest.Mocked<
                typeof moderationService
            >
            mockModerationService.getRecentCases.mockResolvedValue([])

            await request(app)
                .get('/api/guilds/111111111111111111/moderation/cases?limit=50')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(mockModerationService.getRecentCases).toHaveBeenCalledWith(
                '111111111111111111',
                50,
            )
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/moderation/cases')
                .expect(401)

            expect(response.body).toEqual({ error: 'Not authenticated' })
        })

        test('should return 500 on service error', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockModerationService = moderationService as jest.Mocked<
                typeof moderationService
            >
            mockModerationService.getRecentCases.mockRejectedValue(
                new Error('Service error'),
            )

            const response = await request(app)
                .get('/api/guilds/111111111111111111/moderation/cases')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(500)

            expect(response.body).toEqual({
                error: 'Internal server error',
            })
        })
    })

    describe('GET /api/guilds/:guildId/moderation/cases/:caseNumber', () => {
        test('should return specific case', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockCase = {
                id: 'case1',
                guildId: '111111111111111111',
                caseNumber: 1,
                userId: '123456789012345678',
                moderatorId: '987654321098765432',
                action: 'ban',
                reason: 'Spam',
                active: true,
            }

            const mockModerationService = moderationService as jest.Mocked<
                typeof moderationService
            >
            mockModerationService.getCase.mockResolvedValue(mockCase)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/moderation/cases/1')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual(mockCase)
            expect(mockModerationService.getCase).toHaveBeenCalledWith(
                '111111111111111111',
                1,
            )
        })

        test('should return 404 when case not found', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockModerationService = moderationService as jest.Mocked<
                typeof moderationService
            >
            mockModerationService.getCase.mockResolvedValue(null)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/moderation/cases/999')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(404)

            expect(response.body).toEqual({ error: 'Case not found' })
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/moderation/cases/1')
                .expect(401)

            expect(response.body).toEqual({ error: 'Not authenticated' })
        })

        test('should return 500 on service error', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockModerationService = moderationService as jest.Mocked<
                typeof moderationService
            >
            mockModerationService.getCase.mockRejectedValue(
                new Error('Service error'),
            )

            const response = await request(app)
                .get('/api/guilds/111111111111111111/moderation/cases/1')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(500)

            expect(response.body).toEqual({ error: 'Internal server error' })
        })
    })

    describe('GET /api/guilds/:guildId/moderation/users/:userId/cases', () => {
        test('should return user cases with activeOnly=false', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockCases = [
                {
                    id: 'case1',
                    guildId: '111111111111111111',
                    caseNumber: 1,
                    userId: '123456789012345678',
                    moderatorId: '987654321098765432',
                    action: 'warn',
                    reason: 'Test',
                    active: false,
                },
            ]

            const mockModerationService = moderationService as jest.Mocked<
                typeof moderationService
            >
            mockModerationService.getUserCases.mockResolvedValue(mockCases)

            const response = await request(app)
                .get(
                    '/api/guilds/111111111111111111/moderation/users/123456789012345678/cases',
                )
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual({ cases: mockCases })
            expect(mockModerationService.getUserCases).toHaveBeenCalledWith(
                '111111111111111111',
                '123456789012345678',
                false,
            )
        })

        test('should return user cases with activeOnly=true', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockModerationService = moderationService as jest.Mocked<
                typeof moderationService
            >
            mockModerationService.getUserCases.mockResolvedValue([])

            await request(app)
                .get(
                    '/api/guilds/111111111111111111/moderation/users/123456789012345678/cases?activeOnly=true',
                )
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(mockModerationService.getUserCases).toHaveBeenCalledWith(
                '111111111111111111',
                '123456789012345678',
                true,
            )
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .get(
                    '/api/guilds/111111111111111111/moderation/users/123456789012345678/cases',
                )
                .expect(401)

            expect(response.body).toEqual({ error: 'Not authenticated' })
        })

        test('should return 500 on service error', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockModerationService = moderationService as jest.Mocked<
                typeof moderationService
            >
            mockModerationService.getUserCases.mockRejectedValue(
                new Error('Service error'),
            )

            const response = await request(app)
                .get(
                    '/api/guilds/111111111111111111/moderation/users/123456789012345678/cases',
                )
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(500)

            expect(response.body).toEqual({
                error: 'Internal server error',
            })
        })
    })

    describe('PATCH /api/guilds/:guildId/moderation/cases/:caseNumber/reason', () => {
        test('should update case reason', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockCase = {
                id: 'case1',
                guildId: '111111111111111111',
                caseNumber: 1,
                userId: '123456789012345678',
                moderatorId: '987654321098765432',
                action: 'ban',
                reason: 'Old reason',
                active: true,
            }

            const mockModerationService = moderationService as jest.Mocked<
                typeof moderationService
            >
            mockModerationService.getCase.mockResolvedValue(mockCase)

            const mockServerLogService = serverLogService as jest.Mocked<
                typeof serverLogService
            >
            mockServerLogService.logCaseUpdate.mockResolvedValue(undefined)

            const response = await request(app)
                .patch(
                    '/api/guilds/111111111111111111/moderation/cases/1/reason',
                )
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ reason: 'New reason' })
                .expect(200)

            expect(response.body).toEqual({ success: true })
            expect(mockModerationService.getCase).toHaveBeenCalledWith(
                '111111111111111111',
                1,
            )
            expect(mockServerLogService.logCaseUpdate).toHaveBeenCalledWith(
                '111111111111111111',
                {
                    caseNumber: 1,
                    changeType: 'reason_update',
                    oldValue: 'Old reason',
                    newValue: 'New reason',
                },
                MOCK_SESSION_DATA.userId,
            )
        })

        test('should return 400 when reason is missing', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const response = await request(app)
                .patch(
                    '/api/guilds/111111111111111111/moderation/cases/1/reason',
                )
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({})
                .expect(400)

            expect(response.body).toEqual({
                error: 'Validation failed',
                errors: expect.any(Array),
            })
            expect(response.body.errors[0].field).toBe('reason')
        })

        test('should return 404 when case not found', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockModerationService = moderationService as jest.Mocked<
                typeof moderationService
            >
            mockModerationService.getCase.mockResolvedValue(null)

            const response = await request(app)
                .patch(
                    '/api/guilds/111111111111111111/moderation/cases/999/reason',
                )
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ reason: 'New reason' })
                .expect(404)

            expect(response.body).toEqual({ error: 'Case not found' })
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .patch(
                    '/api/guilds/111111111111111111/moderation/cases/1/reason',
                )
                .send({ reason: 'New reason' })
                .expect(401)

            expect(response.body).toEqual({ error: 'Not authenticated' })
        })

        test('should return 500 on service error', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockModerationService = moderationService as jest.Mocked<
                typeof moderationService
            >
            mockModerationService.getCase.mockRejectedValue(
                new Error('Service error'),
            )

            const response = await request(app)
                .patch(
                    '/api/guilds/111111111111111111/moderation/cases/1/reason',
                )
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ reason: 'New reason' })
                .expect(500)

            expect(response.body).toEqual({
                error: 'Internal server error',
            })
        })
    })

    describe('POST /api/guilds/:guildId/moderation/cases/:caseId/deactivate', () => {
        test('should deactivate case', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockUpdatedCase = {
                id: 'case1',
                guildId: '111111111111111111',
                caseNumber: 1,
                userId: '123456789012345678',
                moderatorId: '987654321098765432',
                action: 'ban',
                reason: 'Spam',
                active: false,
            }

            const mockModerationService = moderationService as jest.Mocked<
                typeof moderationService
            >
            mockModerationService.deactivateCase.mockResolvedValue(
                mockUpdatedCase,
            )

            const mockServerLogService = serverLogService as jest.Mocked<
                typeof serverLogService
            >
            mockServerLogService.logCaseUpdate.mockResolvedValue(undefined)

            const response = await request(app)
                .post(
                    '/api/guilds/111111111111111111/moderation/cases/case1/deactivate',
                )
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual(mockUpdatedCase)
            expect(mockModerationService.deactivateCase).toHaveBeenCalledWith(
                'case1',
            )
            expect(mockServerLogService.logCaseUpdate).toHaveBeenCalledWith(
                '111111111111111111',
                {
                    caseNumber: 1,
                    changeType: 'deactivated',
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
                .post(
                    '/api/guilds/111111111111111111/moderation/cases/case1/deactivate',
                )
                .expect(401)

            expect(response.body).toEqual({ error: 'Not authenticated' })
        })

        test('should return 500 on service error', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockModerationService = moderationService as jest.Mocked<
                typeof moderationService
            >
            mockModerationService.deactivateCase.mockRejectedValue(
                new Error('Service error'),
            )

            const response = await request(app)
                .post(
                    '/api/guilds/111111111111111111/moderation/cases/case1/deactivate',
                )
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(500)

            expect(response.body).toEqual({
                error: 'Internal server error',
            })
        })
    })

    describe('GET /api/guilds/:guildId/moderation/settings', () => {
        test('should return moderation settings', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockSettings = {
                guildId: '111111111111111111',
                logChannelId: '333333333333333333',
                muteRoleId: '444444444444444444',
                autoModEnabled: true,
            }

            const mockModerationService = moderationService as jest.Mocked<
                typeof moderationService
            >
            mockModerationService.getSettings.mockResolvedValue(mockSettings)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/moderation/settings')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual(mockSettings)
            expect(mockModerationService.getSettings).toHaveBeenCalledWith(
                '111111111111111111',
            )
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/moderation/settings')
                .expect(401)

            expect(response.body).toEqual({ error: 'Not authenticated' })
        })

        test('should return 500 on service error', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockModerationService = moderationService as jest.Mocked<
                typeof moderationService
            >
            mockModerationService.getSettings.mockRejectedValue(
                new Error('Service error'),
            )

            const response = await request(app)
                .get('/api/guilds/111111111111111111/moderation/settings')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(500)

            expect(response.body).toEqual({
                error: 'Internal server error',
            })
        })
    })

    describe('PATCH /api/guilds/:guildId/moderation/settings', () => {
        test('should update moderation settings', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockSettings = {
                guildId: '111111111111111111',
                logChannelId: '555555555555555555',
                muteRoleId: '666666666666666666',
                autoModEnabled: false,
            }

            const mockModerationService = moderationService as jest.Mocked<
                typeof moderationService
            >
            mockModerationService.updateSettings.mockResolvedValue(mockSettings)

            const mockServerLogService = serverLogService as jest.Mocked<
                typeof serverLogService
            >
            mockServerLogService.logSettingsChange.mockResolvedValue(undefined)

            const response = await request(app)
                .patch('/api/guilds/111111111111111111/moderation/settings')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({
                    logChannelId: '555555555555555555',
                    autoModEnabled: false,
                })
                .expect(200)

            expect(response.body).toEqual(mockSettings)
            expect(mockModerationService.updateSettings).toHaveBeenCalledWith(
                '111111111111111111',
                {
                    logChannelId: '555555555555555555',
                    autoModEnabled: false,
                },
            )
            expect(mockServerLogService.logSettingsChange).toHaveBeenCalledWith(
                '111111111111111111',
                {
                    setting: 'moderation',
                    newValue: {
                        logChannelId: '555555555555555555',
                        autoModEnabled: false,
                    },
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
                .patch('/api/guilds/111111111111111111/moderation/settings')
                .send({ autoModEnabled: false })
                .expect(401)

            expect(response.body).toEqual({ error: 'Not authenticated' })
        })

        test('should return 500 on service error', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockModerationService = moderationService as jest.Mocked<
                typeof moderationService
            >
            mockModerationService.updateSettings.mockRejectedValue(
                new Error('Service error'),
            )

            const response = await request(app)
                .patch('/api/guilds/111111111111111111/moderation/settings')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ autoModEnabled: false })
                .expect(500)

            expect(response.body).toEqual({
                error: 'Internal server error',
            })
        })
    })

    describe('GET /api/guilds/:guildId/moderation/stats', () => {
        test('should return moderation stats', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockStats = {
                totalCases: 42,
                activeCases: 5,
                casesByAction: {
                    ban: 10,
                    kick: 15,
                    warn: 17,
                },
            }

            const mockModerationService = moderationService as jest.Mocked<
                typeof moderationService
            >
            mockModerationService.getStats.mockResolvedValue(mockStats)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/moderation/stats')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual(mockStats)
            expect(mockModerationService.getStats).toHaveBeenCalledWith(
                '111111111111111111',
            )
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/moderation/stats')
                .expect(401)

            expect(response.body).toEqual({ error: 'Not authenticated' })
        })

        test('should return 500 on service error', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockModerationService = moderationService as jest.Mocked<
                typeof moderationService
            >
            mockModerationService.getStats.mockRejectedValue(
                new Error('Service error'),
            )

            const response = await request(app)
                .get('/api/guilds/111111111111111111/moderation/stats')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(500)

            expect(response.body).toEqual({
                error: 'Internal server error',
            })
        })
    })
})
