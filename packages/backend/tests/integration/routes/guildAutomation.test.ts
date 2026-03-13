import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupSessionMiddleware } from '../../../src/middleware/session'
import { setupGuildAutomationRoutes } from '../../../src/routes/guildAutomation'
import { errorHandler } from '../../../src/middleware/errorHandler'
import { sessionService } from '../../../src/services/SessionService'
import { MOCK_SESSION_DATA } from '../../fixtures/mock-data'

jest.mock('../../../src/services/SessionService', () => ({
    sessionService: {
        getSession: jest.fn(),
    },
}))

jest.mock('@lucky/shared/services', () => ({
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

import {
    guildAutomationService,
    validateGuildAutomationManifest,
} from '@lucky/shared/services'

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

        expect(mockedService.createApplyRun).toHaveBeenCalledWith(
            '111111111111111111',
            {
                actualState: undefined,
                initiatedBy: MOCK_SESSION_DATA.userId,
                allowProtected: true,
                runType: 'apply',
            },
        )
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

    test('POST criativaria preset applies manifest and reconcile run', async () => {
        const mockedService = guildAutomationService as jest.Mocked<
            typeof guildAutomationService
        >

        mockedService.saveManifest.mockResolvedValue({
            guildId: '111111111111111111',
            version: 1,
            updatedAt: new Date(),
        } as any)
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

        const response = await request(app)
            .post('/api/guilds/111111111111111111/automation/presets/criativaria/apply')
            .set('Cookie', ['sessionId=valid_session_id'])
            .expect(200)

        expect(response.body).toEqual({
            success: true,
            preset: 'criativaria',
            manifestVersion: 1,
            run: {
                runId: 'run-3',
                status: 'completed',
                blockedByProtected: false,
                plan: {
                    operations: [],
                    protectedOperations: [],
                    summary: { total: 0, safe: 0, protected: 0 },
                },
            },
        })
        expect(mockedService.saveManifest).toHaveBeenCalled()
        expect(mockedService.createApplyRun).toHaveBeenCalledWith(
            '111111111111111111',
            expect.objectContaining({
                initiatedBy: MOCK_SESSION_DATA.userId,
                allowProtected: false,
                runType: 'reconcile',
            }),
        )
    })
})
