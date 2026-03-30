import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupSessionMiddleware } from '../../../src/middleware/session'
import { setupGuildAutomationRoutes } from '../../../src/routes/guildAutomation'
import { errorHandler } from '../../../src/middleware/errorHandler'
import { requireGuildModuleAccess } from '../../../src/middleware/guildAccess'
import { sessionService } from '../../../src/services/SessionService'
import { guildAccessService } from '../../../src/services/GuildAccessService'
import { MOCK_SESSION_DATA } from '../../fixtures/mock-data'

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

const GUILD_ID = '111111111111111111'
const SESSION_COOKIE = ['sessionId=valid_session_id']

const MOCK_GUILD_CONTEXT = {
    guildId: GUILD_ID,
    owner: true,
    isAdmin: true,
    effectiveAccess: { settings: 'manage' as const },
    roleIds: [],
    nickname: null,
    canManageRbac: true,
}

const MOCK_PLAN = {
    operations: [],
    protectedOperations: [],
    summary: { total: 0, safe: 0, protected: 0 },
}

const MOCK_MANIFEST = {
    guildId: GUILD_ID,
    version: 1,
    guild: { id: GUILD_ID },
    source: 'manual' as const,
}

describe('Guild Automation Routes', () => {
    let app: express.Express
    let mockedService: jest.Mocked<typeof guildAutomationService>
    let mockedGuildAccessService: jest.Mocked<typeof guildAccessService>
    let mockedSessionService: jest.Mocked<typeof sessionService>

    beforeEach(() => {
        app = express()
        app.use(express.json())
        setupSessionMiddleware(app)
        setupGuildAutomationRoutes(app)

        app.get(
            '/api/test-route-without-guild-param',
            requireGuildModuleAccess('settings', 'view'),
            (_req, res) => {
                res.json({ ok: true })
            },
        )

        app.use(errorHandler)
        jest.clearAllMocks()

        mockedService = guildAutomationService as jest.Mocked<
            typeof guildAutomationService
        >
        mockedGuildAccessService = guildAccessService as jest.Mocked<
            typeof guildAccessService
        >
        mockedSessionService = sessionService as jest.Mocked<
            typeof sessionService
        >

        mockedSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)
        mockedGuildAccessService.resolveGuildContext.mockResolvedValue(
            MOCK_GUILD_CONTEXT as any,
        )
        mockedGuildAccessService.hasAccess.mockReturnValue(true)
    })

    test('GET manifest returns 404 when not found', async () => {
        mockedService.getManifest.mockResolvedValue(null)

        await request(app)
            .get(`/api/guilds/${GUILD_ID}/automation/manifest`)
            .set('Cookie', SESSION_COOKIE)
            .expect(404)
    })

    test('PUT manifest saves manifest', async () => {
        mockedService.saveManifest.mockResolvedValue({
            guildId: GUILD_ID,
            version: 1,
            updatedAt: new Date(),
        } as any)

        await request(app)
            .put(`/api/guilds/${GUILD_ID}/automation/manifest`)
            .set('Cookie', SESSION_COOKIE)
            .send({ version: 1, guild: { id: GUILD_ID }, source: 'manual' })
            .expect(200)

        expect(validateGuildAutomationManifest).toHaveBeenCalled()
        expect(mockedService.saveManifest).toHaveBeenCalled()
    })

    test('POST plan delegates to shared automation service', async () => {
        mockedService.createPlan.mockResolvedValue({
            runId: 'run-1',
            desired: { version: 1, guild: { id: GUILD_ID } },
            actual: { version: 1, guild: { id: GUILD_ID } },
            plan: MOCK_PLAN,
        } as any)

        await request(app)
            .post(`/api/guilds/${GUILD_ID}/automation/plan`)
            .set('Cookie', SESSION_COOKIE)
            .send({})
            .expect(200)

        expect(mockedService.createPlan).toHaveBeenCalledWith(GUILD_ID, {
            actualState: undefined,
            initiatedBy: MOCK_SESSION_DATA.userId,
            runType: 'plan',
        })
    })

    test('POST apply delegates with allowProtected option', async () => {
        mockedService.createApplyRun.mockResolvedValue({
            runId: 'run-2',
            status: 'completed',
            blockedByProtected: false,
            plan: MOCK_PLAN,
        } as any)

        await request(app)
            .post(`/api/guilds/${GUILD_ID}/automation/apply`)
            .set('Cookie', SESSION_COOKIE)
            .send({ allowProtected: true })
            .expect(200)

        expect(mockedService.createApplyRun).toHaveBeenCalledWith(GUILD_ID, {
            actualState: undefined,
            initiatedBy: MOCK_SESSION_DATA.userId,
            allowProtected: true,
            runType: 'apply',
        })
    })

    test('GET status returns status and recent runs', async () => {
        mockedService.getStatus.mockResolvedValue({
            manifest: null,
            latestRun: null,
            drifts: [],
        })
        mockedService.listRuns.mockResolvedValue([] as any)

        const response = await request(app)
            .get(`/api/guilds/${GUILD_ID}/automation/status`)
            .set('Cookie', SESSION_COOKIE)
            .expect(200)

        expect(response.body).toEqual({
            status: { manifest: null, latestRun: null, drifts: [] },
            runs: [],
        })
    })

    test('POST criativaria preset applies manifest and reconcile run', async () => {
        mockedService.saveManifest.mockResolvedValue({
            guildId: GUILD_ID,
            version: 1,
            updatedAt: new Date(),
        } as any)
        mockedService.createApplyRun.mockResolvedValue({
            runId: 'run-3',
            status: 'completed',
            blockedByProtected: false,
            plan: MOCK_PLAN,
        } as any)

        const response = await request(app)
            .post(
                `/api/guilds/${GUILD_ID}/automation/presets/criativaria/apply`,
            )
            .set('Cookie', SESSION_COOKIE)
            .expect(200)

        expect(response.body).toEqual({
            success: true,
            preset: 'criativaria',
            manifestVersion: 1,
            run: {
                runId: 'run-3',
                status: 'completed',
                blockedByProtected: false,
                plan: MOCK_PLAN,
            },
        })
        expect(mockedService.saveManifest).toHaveBeenCalled()
        expect(mockedService.createApplyRun).toHaveBeenCalledWith(
            GUILD_ID,
            expect.objectContaining({
                initiatedBy: MOCK_SESSION_DATA.userId,
                allowProtected: false,
                runType: 'reconcile',
            }),
        )
    })

    test('returns 403 for user without settings:manage on write routes', async () => {
        mockedGuildAccessService.hasAccess.mockReturnValue(false)

        await request(app)
            .put(`/api/guilds/${GUILD_ID}/automation/manifest`)
            .set('Cookie', SESSION_COOKIE)
            .send({ version: 1, guild: { id: GUILD_ID } })
            .expect(403)
    })

    test('returns 403 for user without guild access on read routes', async () => {
        mockedGuildAccessService.resolveGuildContext.mockResolvedValue(null)

        await request(app)
            .get(`/api/guilds/${GUILD_ID}/automation/manifest`)
            .set('Cookie', SESSION_COOKIE)
            .expect(403)
    })

    test('returns 401 for unauthenticated requests', async () => {
        mockedSessionService.getSession.mockResolvedValue(null)

        await request(app)
            .get(`/api/guilds/${GUILD_ID}/automation/manifest`)
            .set('Cookie', ['sessionId=invalid_session_id'])
            .expect(401)
    })

    test('returns 401 when no session cookie provided', async () => {
        await request(app)
            .get(`/api/guilds/${GUILD_ID}/automation/manifest`)
            .expect(401)
    })

    test('returns 400 when guildId param is missing', async () => {
        await request(app)
            .get('/api/guilds//automation/manifest')
            .set('Cookie', SESSION_COOKIE)
            .expect(404)
    })

    test('attaches userId to request from session data', async () => {
        mockedService.getManifest.mockResolvedValue(MOCK_MANIFEST as any)

        await request(app)
            .get(`/api/guilds/${GUILD_ID}/automation/manifest`)
            .set('Cookie', SESSION_COOKIE)
            .expect(200)

        expect(mockedService.getManifest).toHaveBeenCalledWith(GUILD_ID)
    })

    test('returns 400 when route has no guildId or id parameter', async () => {
        await request(app)
            .get('/api/test-route-without-guild-param')
            .set('Cookie', SESSION_COOKIE)
            .expect(400)
    })

    test('auto mode resolves to manage access for POST requests', async () => {
        mockedGuildAccessService.hasAccess.mockReturnValue(false)

        await request(app)
            .post(`/api/guilds/${GUILD_ID}/automation/plan`)
            .set('Cookie', SESSION_COOKIE)
            .send({})
            .expect(403)

        expect(mockedGuildAccessService.hasAccess).toHaveBeenCalledWith(
            expect.any(Object),
            'settings',
            'manage',
        )
    })

    test('auto mode resolves to view access for HEAD requests', async () => {
        mockedService.getManifest.mockResolvedValue(MOCK_MANIFEST as any)

        await request(app)
            .head(`/api/guilds/${GUILD_ID}/automation/manifest`)
            .set('Cookie', SESSION_COOKIE)
            .expect(200)

        expect(mockedGuildAccessService.hasAccess).toHaveBeenCalledWith(
            expect.any(Object),
            'settings',
            'view',
        )
    })
})
