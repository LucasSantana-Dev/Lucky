import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupSessionMiddleware } from '../../../src/middleware/session'
import { setupGuildAutomationRoutes } from '../../../src/routes/guildAutomation'
import { errorHandler } from '../../../src/middleware/errorHandler'
import { AppError } from '../../../src/errors/AppError'
import { sessionService } from '../../../src/services/SessionService'
import { MOCK_SESSION_DATA } from '../../fixtures/mock-data'
import { guildAutomationManifestSchema } from '@lucky/shared/services/guildAutomation/manifestSchema'
import {
    GuildAutomationLockUnavailableError,
    GuildAutomationCaptureRequiredError,
    GuildAutomationManifestNotFoundError,
} from '@lucky/shared/types'

jest.mock('../../../src/services/SessionService', () => ({
    sessionService: {
        getSession: jest.fn(),
    },
}))

jest.mock('@lucky/shared/services', () => ({
    __esModule: true,
    guildAutomationService: {
        getManifest: jest.fn(),
        saveManifest: jest.fn(),
        recordCapture: jest.fn(),
        createPlan: jest.fn(),
        createApplyRun: jest.fn(),
        getStatus: jest.fn(),
        listRuns: jest.fn(),
        runCutover: jest.fn(),
    },
    validateGuildAutomationManifest: jest.fn((input: unknown) => input),
}))

jest.mock('../../../src/services/GuildAutomationExecutionService', () => ({
    guildAutomationExecutionService: {
        captureGuildAutomationState: jest.fn(),
        executeApplyPlan: jest.fn(),
    },
    GuildAutomationExecutionError: class GuildAutomationExecutionError extends Error {
        public readonly statusCode: number

        constructor(message: string, statusCode = 500) {
            super(message)
            this.statusCode = statusCode
        }
    },
}))

import {
    guildAutomationService,
    validateGuildAutomationManifest,
} from '@lucky/shared/services'
import { guildAutomationExecutionService } from '../../../src/services/GuildAutomationExecutionService'

describe('Guild Automation Routes', () => {
    let app: express.Express

    beforeEach(() => {
        app = express()
        app.use(express.json())
        setupSessionMiddleware(app)
        setupGuildAutomationRoutes(app)
        app.use(errorHandler)
        jest.clearAllMocks()

        const mockedSessionService = sessionService as jest.Mocked<
            typeof sessionService
        >
        mockedSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

        const mockedExecutionService =
            guildAutomationExecutionService as jest.Mocked<
                typeof guildAutomationExecutionService
            >
        mockedExecutionService.captureGuildAutomationState.mockResolvedValue({
            version: 1,
            guild: { id: '111111111111111111' },
        } as any)
        mockedExecutionService.executeApplyPlan.mockResolvedValue({
            diagnostics: {
                appliedModules: ['roles'],
            },
        })
    })

    test('GET manifest returns 404 when not found', async () => {
        const mockedService = guildAutomationService as jest.Mocked<
            typeof guildAutomationService
        >
        mockedService.getManifest.mockResolvedValue(null)

        await request(app)
            .get('/api/guilds/111111111111111111/automation/manifest')
            .set('Cookie', ['sessionId=valid_session_id'])
            .expect(404)
    })

    test('PUT manifest saves manifest', async () => {
        const mockedService = guildAutomationService as jest.Mocked<
            typeof guildAutomationService
        >

        mockedService.saveManifest.mockResolvedValue({
            guildId: '111111111111111111',
            version: 1,
            updatedAt: new Date(),
        } as any)

        await request(app)
            .put('/api/guilds/111111111111111111/automation/manifest')
            .set('Cookie', ['sessionId=valid_session_id'])
            .send({
                version: 1,
                guild: { id: '111111111111111111' },
                source: 'manual',
            })
            .expect(200)

        expect(validateGuildAutomationManifest).toHaveBeenCalled()
        expect(mockedService.saveManifest).toHaveBeenCalled()
    })

    test('POST plan delegates to shared automation service', async () => {
        const mockedService = guildAutomationService as jest.Mocked<
            typeof guildAutomationService
        >

        mockedService.createPlan.mockResolvedValue({
            runId: 'run-1',
            desired: { version: 1, guild: { id: '111111111111111111' } },
            actual: { version: 1, guild: { id: '111111111111111111' } },
            plan: {
                operations: [],
                protectedOperations: [],
                summary: { total: 0, safe: 0, protected: 0 },
            },
        } as any)

        await request(app)
            .post('/api/guilds/111111111111111111/automation/plan')
            .set('Cookie', ['sessionId=valid_session_id'])
            .send({})
            .expect(200)

        expect(mockedService.createPlan).toHaveBeenCalledWith(
            '111111111111111111',
            {
                actualState: undefined,
                initiatedBy: MOCK_SESSION_DATA.userId,
                runType: 'plan',
            },
        )
    })

    test('POST plan maps missing manifest precondition to 404', async () => {
        const mockedService = guildAutomationService as jest.Mocked<
            typeof guildAutomationService
        >
        mockedService.createPlan.mockRejectedValue(
            new GuildAutomationManifestNotFoundError('111111111111111111'),
        )

        const response = await request(app)
            .post('/api/guilds/111111111111111111/automation/plan')
            .set('Cookie', ['sessionId=valid_session_id'])
            .send({})
            .expect(404)

        expect(response.body).toEqual({
            error: 'Automation manifest not found',
        })
    })

    test('POST apply maps capture precondition to 400', async () => {
        const mockedService = guildAutomationService as jest.Mocked<
            typeof guildAutomationService
        >
        mockedService.createApplyRun.mockRejectedValue(
            new GuildAutomationCaptureRequiredError('111111111111111111'),
        )

        const response = await request(app)
            .post('/api/guilds/111111111111111111/automation/apply')
            .set('Cookie', ['sessionId=valid_session_id'])
            .send({})
            .expect(400)

        expect(response.body).toEqual({
            error: 'No captured guild state available. Run capture before plan/apply.',
        })
    })

    test('POST plan rejects malformed nested manifest in actualState', async () => {
        const response = await request(app)
            .post('/api/guilds/111111111111111111/automation/plan')
            .set('Cookie', ['sessionId=valid_session_id'])
            .send({
                actualState: {
                    version: 1,
                    guild: { id: '111111111111111111' },
                    roles: { roles: 'invalid' },
                },
            })
            .expect(400)

        expect(response.body).toEqual(
            expect.objectContaining({
                error: 'Validation failed',
            }),
        )
    })

    test('PUT manifest keeps one route contract test on the real parser', async () => {
        const validator = validateGuildAutomationManifest as jest.Mock
        validator.mockImplementation((input: unknown) =>
            guildAutomationManifestSchema.parse(input),
        )

        const response = await request(app)
            .put('/api/guilds/111111111111111111/automation/manifest')
            .set('Cookie', ['sessionId=valid_session_id'])
            .send({
                version: 1,
                guild: { id: '111111111111111111' },
                roles: { roles: 'invalid', channels: [] },
            })
            .expect(400)

        expect(response.body).toEqual(
            expect.objectContaining({
                error: 'Validation failed',
            }),
        )
    })

    test('POST apply delegates with allowProtected option', async () => {
        const mockedService = guildAutomationService as jest.Mocked<
            typeof guildAutomationService
        >

        mockedService.createApplyRun.mockResolvedValue({
            runId: 'run-2',
            status: 'completed',
            blockedByProtected: false,
            plan: {
                operations: [],
                protectedOperations: [],
                summary: { total: 0, safe: 0, protected: 0 },
            },
        } as any)

        await request(app)
            .post('/api/guilds/111111111111111111/automation/apply')
            .set('Cookie', ['sessionId=valid_session_id'])
            .send({ allowProtected: true })
            .expect(200)

        const mockedExecutionService =
            guildAutomationExecutionService as jest.Mocked<
                typeof guildAutomationExecutionService
            >

        expect(mockedExecutionService.captureGuildAutomationState).toHaveBeenCalledWith(
            '111111111111111111',
        )
        expect(mockedService.createApplyRun).toHaveBeenCalledWith(
            '111111111111111111',
            expect.objectContaining({
                initiatedBy: MOCK_SESSION_DATA.userId,
                allowProtected: true,
                runType: 'apply',
                executor: expect.any(Function),
            }),
        )
    })

    test('POST capture delegates to shared automation service', async () => {
        const mockedService = guildAutomationService as jest.Mocked<
            typeof guildAutomationService
        >
        mockedService.recordCapture.mockResolvedValue({
            manifestId: 'manifest-1',
            runId: 'run-capture-1',
        } as any)

        const response = await request(app)
            .post('/api/guilds/111111111111111111/automation/capture')
            .set('Cookie', ['sessionId=valid_session_id'])
            .send({
                version: 1,
                guild: { id: '111111111111111111' },
                source: 'manual',
            })
            .expect(201)

        expect(mockedService.recordCapture).toHaveBeenCalledWith(
            '111111111111111111',
            expect.any(Object),
            MOCK_SESSION_DATA.userId,
        )
        expect(response.body).toEqual({
            manifestId: 'manifest-1',
            runId: 'run-capture-1',
        })
    })

    test('POST apply does not capture when actualState is provided', async () => {
        const mockedService = guildAutomationService as jest.Mocked<
            typeof guildAutomationService
        >
        const mockedExecutionService =
            guildAutomationExecutionService as jest.Mocked<
                typeof guildAutomationExecutionService
            >
        mockedService.createApplyRun.mockResolvedValue({
            runId: 'run-3',
            status: 'completed',
            blockedByProtected: false,
            plan: {
                operations: [],
                protectedOperations: [],
                summary: { total: 0, safe: 0, protected: 0 },
            },
        } as any)

        await request(app)
            .post('/api/guilds/111111111111111111/automation/apply')
            .set('Cookie', ['sessionId=valid_session_id'])
            .send({
                allowProtected: false,
                actualState: {
                    version: 1,
                    guild: { id: '111111111111111111' },
                },
            })
            .expect(200)

        expect(mockedExecutionService.captureGuildAutomationState).not.toHaveBeenCalled()
    })

    test('POST reconcile delegates with execution pipeline and reconcile run type', async () => {
        const mockedService = guildAutomationService as jest.Mocked<
            typeof guildAutomationService
        >
        const mockedExecutionService =
            guildAutomationExecutionService as jest.Mocked<
                typeof guildAutomationExecutionService
            >
        mockedService.createApplyRun.mockResolvedValue({
            runId: 'run-4',
            status: 'completed',
            blockedByProtected: false,
            plan: {
                operations: [],
                protectedOperations: [],
                summary: { total: 0, safe: 0, protected: 0 },
            },
        } as any)

        await request(app)
            .post('/api/guilds/111111111111111111/automation/reconcile')
            .set('Cookie', ['sessionId=valid_session_id'])
            .send({ allowProtected: true })
            .expect(200)

        expect(mockedExecutionService.captureGuildAutomationState).toHaveBeenCalledWith(
            '111111111111111111',
        )
        expect(mockedService.createApplyRun).toHaveBeenCalledWith(
            '111111111111111111',
            expect.objectContaining({
                initiatedBy: MOCK_SESSION_DATA.userId,
                allowProtected: true,
                runType: 'reconcile',
                executor: expect.any(Function),
            }),
        )
    })

    test('POST cutover delegates completeChecklist option', async () => {
        const mockedService = guildAutomationService as jest.Mocked<
            typeof guildAutomationService
        >
        mockedService.runCutover.mockResolvedValue({
            runId: 'run-cutover-1',
            status: 'completed',
            checklistComplete: true,
        } as any)

        await request(app)
            .post('/api/guilds/111111111111111111/automation/cutover')
            .set('Cookie', ['sessionId=valid_session_id'])
            .send({ completeChecklist: true })
            .expect(200)

        expect(mockedService.runCutover).toHaveBeenCalledWith(
            '111111111111111111',
            {
                initiatedBy: MOCK_SESSION_DATA.userId,
                completeChecklist: true,
            },
        )
    })

    test('POST apply maps lock backend unavailable to 503', async () => {
        const mockedService = guildAutomationService as jest.Mocked<
            typeof guildAutomationService
        >
        mockedService.createApplyRun.mockRejectedValue(
            new GuildAutomationLockUnavailableError('111111111111111111'),
        )

        const response = await request(app)
            .post('/api/guilds/111111111111111111/automation/apply')
            .set('Cookie', ['sessionId=valid_session_id'])
            .send({})
            .expect(503)

        expect(response.body).toEqual({
            error: 'Guild automation lock backend is unavailable',
        })
    })

    test('POST plan keeps AppError responses unchanged', async () => {
        const mockedService = guildAutomationService as jest.Mocked<
            typeof guildAutomationService
        >
        mockedService.createPlan.mockRejectedValue(
            AppError.badRequest('Plan payload rejected'),
        )

        const response = await request(app)
            .post('/api/guilds/111111111111111111/automation/plan')
            .set('Cookie', ['sessionId=valid_session_id'])
            .send({})
            .expect(400)

        expect(response.body).toEqual({
            error: 'Plan payload rejected',
        })
    })

    test('POST cutover maps non-error throw to generic 500', async () => {
        const mockedService = guildAutomationService as jest.Mocked<
            typeof guildAutomationService
        >
        mockedService.runCutover.mockRejectedValue('unknown-error')

        await request(app)
            .post('/api/guilds/111111111111111111/automation/cutover')
            .set('Cookie', ['sessionId=valid_session_id'])
            .send({})
            .expect(500)
    })

    test('POST plan returns 401 when session does not include user id', async () => {
        const mockedSessionService = sessionService as jest.Mocked<
            typeof sessionService
        >
        mockedSessionService.getSession.mockResolvedValue({
            ...MOCK_SESSION_DATA,
            userId: '',
        } as any)

        await request(app)
            .post('/api/guilds/111111111111111111/automation/plan')
            .set('Cookie', ['sessionId=valid_session_id'])
            .send({})
            .expect(401)
    })

    test('GET status returns status and recent runs', async () => {
        const mockedService = guildAutomationService as jest.Mocked<
            typeof guildAutomationService
        >

        mockedService.getStatus.mockResolvedValue({
            manifest: null,
            latestRun: null,
            drifts: [],
        })
        mockedService.listRuns.mockResolvedValue([] as any)

        const response = await request(app)
            .get('/api/guilds/111111111111111111/automation/status')
            .set('Cookie', ['sessionId=valid_session_id'])
            .expect(200)

        expect(response.body).toEqual({
            status: {
                manifest: null,
                latestRun: null,
                drifts: [],
            },
            runs: [],
        })
    })
})
