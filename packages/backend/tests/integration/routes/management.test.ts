import { errorHandler } from '../../../src/middleware/errorHandler'
import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupManagementRoutes } from '../../../src/routes/management'
import { setupSessionMiddleware } from '../../../src/middleware/session'
import { sessionService } from '../../../src/services/SessionService'
import { MOCK_SESSION_DATA, MOCK_GUILD_CONTEXT } from '../../fixtures/mock-data'
import { ValidationError } from '@lucky/shared/errors/ValidationError'

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
    // Route-wiring test: pass logs through unchanged. The real serializer's
    // behaviour is covered by ServerLogService.spec.ts.
    serializeServerLog: (log: unknown) => log,
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
    featureToggleService: {
        isEnabled: jest.fn(),
        setGuildFeatureToggle: jest.fn(),
    },
    serverLogService: {
        getRecentLogs: jest.fn(),
        getLogsByType: jest.fn(),
        searchLogs: jest.fn(),
        countSearchLogs: jest.fn(),
        getUserLogs: jest.fn(),
        getStats: jest.fn(),
        countRecentLogs: jest.fn(),
        countLogsByType: jest.fn(),
        logAutoModSettingsChange: jest.fn(),
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
    featureToggleService,
    serverLogService,
} from '@lucky/shared/services'
import { guildAccessService } from '../../../src/services/GuildAccessService'

describe('Management Routes Integration', () => {
    let app: express.Express

    beforeEach(() => {
        app = express()
        app.use(express.json())
        setupSessionMiddleware(app)
        setupManagementRoutes(app)
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

            expect(response.body).toEqual({ settings: mockSettings })
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

        // No "403 for unauthorized user" test here: #2409 removed this
        // route's own requireGuildModuleAccess check (it duplicated, and
        // conflicted with, the `/automod` prefix guard in routes/index.ts).
        // Guild-access enforcement for this path is now covered end-to-end
        // by tests/integration/routes/guildRouteGuardConsistency.test.ts and
        // tests/unit/routes/index.test.ts, which exercise the real prefix
        // wiring; this file mounts setupManagementRoutes in isolation, so it
        // no longer has that check to observe.

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

            expect(response.body).toEqual({ settings: updatedSettings })
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

        test('should return 400 on invalid body', async () => {
            const response = await request(app)
                .patch('/api/guilds/111111111111111111/automod/settings')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ spamThreshold: 'not a number' })
                .expect(400)

            expect(response.body).toHaveProperty('error')
        })
    })

    describe('Auto-mod templates routes', () => {
        test('GET /api/guilds/:guildId/automod/templates returns templates', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockTemplates = [
                { id: 'template-1', name: 'Strict' },
                { id: 'template-2', name: 'Moderate' },
            ]

            const mockAutoModService = autoModService as jest.Mocked<
                typeof autoModService
            >
            mockAutoModService.listTemplates.mockResolvedValue(mockTemplates)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/automod/templates')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual({
                templates: mockTemplates,
            })
            expect(mockAutoModService.listTemplates).toHaveBeenCalled()
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
                template: { id: 'template-1' },
                settings: { enabled: true },
            })

            const mockServerLogService = serverLogService as jest.Mocked<
                typeof serverLogService
            >
            mockServerLogService.logAutoModSettingsChange.mockResolvedValue()

            const response = await request(app)
                .post(
                    '/api/guilds/111111111111111111/automod/templates/template-1/apply',
                )
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual({
                templateId: 'template-1',
                settings: { enabled: true },
            })
            expect(mockAutoModService.applyTemplate).toHaveBeenCalledWith(
                '111111111111111111',
                'template-1',
            )
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
                new AutoModTemplateNotFoundError('unknown-id'),
            )

            const response = await request(app)
                .post(
                    '/api/guilds/111111111111111111/automod/templates/unknown-id/apply',
                )
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(404)

            expect(response.body).toEqual({
                error: 'Auto-mod template not found',
            })
        })
    })

    describe('GET /api/guilds/:guildId/logs', () => {
        test('should return recent logs when authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockLogs = [{ id: 'log-1', type: 'automod' }]

            const mockServerLogService = serverLogService as jest.Mocked<
                typeof serverLogService
            >
            mockServerLogService.getRecentLogs.mockResolvedValue(mockLogs)
            mockServerLogService.countRecentLogs.mockResolvedValue(10)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/logs')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual({ logs: mockLogs, total: 10 })
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

            const mockLogs = [{ id: 'log-1', type: 'error' }]

            const mockServerLogService = serverLogService as jest.Mocked<
                typeof serverLogService
            >
            mockServerLogService.getLogsByType.mockResolvedValue(mockLogs)
            mockServerLogService.countLogsByType.mockResolvedValue(5)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/logs?type=error')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual({ logs: mockLogs, total: 5 })
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
    })

    describe('GET /api/guilds/:guildId/logs/search', () => {
        test('should search logs by text query when authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockLogs = [{ id: 'log-1', type: 'automod' }]

            const mockServerLogService = serverLogService as jest.Mocked<
                typeof serverLogService
            >
            mockServerLogService.searchLogs.mockResolvedValue(mockLogs)
            mockServerLogService.countSearchLogs.mockResolvedValue(1)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/logs/search?q=test')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual({ logs: mockLogs, total: 1 })
            expect(mockServerLogService.searchLogs).toHaveBeenCalledWith(
                '111111111111111111',
                {
                    q: 'test',
                    type: undefined,
                    userId: undefined,
                },
                50,
                0,
            )
            expect(mockServerLogService.countSearchLogs).toHaveBeenCalledWith(
                '111111111111111111',
                {
                    q: 'test',
                    type: undefined,
                    userId: undefined,
                },
            )
        })

        test('threads limit and offset through to the service for pagination', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockServerLogService = serverLogService as jest.Mocked<
                typeof serverLogService
            >
            mockServerLogService.searchLogs.mockResolvedValue([])
            mockServerLogService.countSearchLogs.mockResolvedValue(0)

            await request(app)
                .get(
                    '/api/guilds/111111111111111111/logs/search?q=test&limit=10&offset=20',
                )
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(mockServerLogService.searchLogs).toHaveBeenCalledWith(
                '111111111111111111',
                expect.objectContaining({ q: 'test' }),
                10,
                20,
            )
        })

        test('rejects a search query over the 200 character limit', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const response = await request(app)
                .get(
                    `/api/guilds/111111111111111111/logs/search?q=${'a'.repeat(201)}`,
                )
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(400)

            expect(response.body.error).toBe('Validation failed')
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
    })

    describe('GET /api/guilds/:guildId/logs/users/:userId', () => {
        test('should return user logs when authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockLogs = [{ id: 'log-1', type: 'command' }]

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
                .get('/api/guilds/111111111111111111/logs/users/user-123')
                .expect(401)

            expect(response.body).toEqual({
                error: 'Not authenticated',
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
                totalLogs: 100,
                byType: { automod: 50, command: 30, other: 20 },
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
    })

    describe('/api/guilds/:guildId/logs/settings', () => {
        const mockToggles = featureToggleService as jest.Mocked<
            typeof featureToggleService
        >

        test('GET returns the guild SERVER_LOGS state', async () => {
            mockToggles.isEnabled.mockResolvedValue(false)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/logs/settings')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual({ enabled: false })
            expect(mockToggles.isEnabled).toHaveBeenCalledWith('SERVER_LOGS', {
                guildId: '111111111111111111',
            })
        })

        test('PUT returns the state recomputed after the write', async () => {
            mockToggles.setGuildFeatureToggle.mockResolvedValue()
            // Opt-in is stored, but a global kill switch keeps it off.
            mockToggles.isEnabled.mockResolvedValueOnce(false)

            const response = await request(app)
                .put('/api/guilds/111111111111111111/logs/settings')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ enabled: true })
                .expect(200)

            expect(response.body).toEqual({ enabled: false })
            expect(mockToggles.isEnabled).toHaveBeenCalledTimes(1)
            expect(mockToggles.setGuildFeatureToggle).toHaveBeenCalledWith(
                '111111111111111111',
                'SERVER_LOGS',
                true,
            )
        })

        test('GET requires moderation view access', async () => {
            const mockGuildAccessService = guildAccessService as jest.Mocked<
                typeof guildAccessService
            >
            mockGuildAccessService.hasAccess.mockReturnValue(false)

            await request(app)
                .get('/api/guilds/111111111111111111/logs/settings')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(403)

            expect(mockGuildAccessService.hasAccess).toHaveBeenCalledWith(
                MOCK_GUILD_CONTEXT,
                'moderation',
                'view',
            )
            expect(mockToggles.isEnabled).not.toHaveBeenCalled()
        })

        test('PUT requires moderation manage access', async () => {
            const mockGuildAccessService = guildAccessService as jest.Mocked<
                typeof guildAccessService
            >
            mockGuildAccessService.hasAccess.mockReturnValue(false)

            await request(app)
                .put('/api/guilds/111111111111111111/logs/settings')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ enabled: true })
                .expect(403)

            expect(mockGuildAccessService.hasAccess).toHaveBeenCalledWith(
                MOCK_GUILD_CONTEXT,
                'moderation',
                'manage',
            )
            expect(mockToggles.setGuildFeatureToggle).not.toHaveBeenCalled()
        })

        test('GET returns 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            await request(app)
                .get('/api/guilds/111111111111111111/logs/settings')
                .expect(401)

            expect(mockToggles.isEnabled).not.toHaveBeenCalled()
        })

        test('PUT rejects a non-boolean body', async () => {
            await request(app)
                .put('/api/guilds/111111111111111111/logs/settings')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ enabled: 'yes' })
                .expect(400)

            expect(mockToggles.setGuildFeatureToggle).not.toHaveBeenCalled()
        })

        test('PUT returns 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            await request(app)
                .put('/api/guilds/111111111111111111/logs/settings')
                .send({ enabled: true })
                .expect(401)

            expect(mockToggles.setGuildFeatureToggle).not.toHaveBeenCalled()
        })
    })
})
