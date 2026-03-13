import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupRbacRoutes } from '../../../src/routes/rbac'
import { setupSessionMiddleware } from '../../../src/middleware/session'
import { errorHandler } from '../../../src/middleware/errorHandler'
import { sessionService } from '../../../src/services/SessionService'
import { MOCK_SESSION_DATA } from '../../fixtures/mock-data'

const mockListRoleGrants = jest.fn<any>()
const mockReplaceRoleGrants = jest.fn<any>()

jest.mock('@lucky/shared/services', () => ({
    GuildRoleGrantStorageError: class GuildRoleGrantStorageError extends Error {},
    RBAC_MODULES: [
        'overview',
        'settings',
        'moderation',
        'automation',
        'music',
        'integrations',
    ],
    guildRoleAccessService: {
        listRoleGrants: (...args: any[]) => mockListRoleGrants(...args),
        replaceRoleGrants: (...args: any[]) => mockReplaceRoleGrants(...args),
    },
}))
import { GuildRoleGrantStorageError } from '@lucky/shared/services'

const mockGetGuildRoleOptions = jest.fn<any>()

jest.mock('../../../src/services/GuildService', () => ({
    guildService: {
        getGuildRoleOptions: (...args: any[]) =>
            mockGetGuildRoleOptions(...args),
    },
}))

jest.mock('../../../src/services/SessionService', () => ({
    sessionService: {
        getSession: jest.fn(),
    },
}))

const MANAGE_ACCESS = {
    overview: 'manage',
    settings: 'manage',
    moderation: 'manage',
    automation: 'manage',
    music: 'manage',
    integrations: 'manage',
} as const

describe('RBAC Routes Integration', () => {
    let app: express.Express
    let canManageRbac = true
    const guildId = '111111111111111111'

    beforeEach(() => {
        app = express()
        app.use(express.json())
        setupSessionMiddleware(app)
        canManageRbac = true

        app.use('/api/guilds/:guildId/rbac', (req, _res, next) => {
            ;(req as any).guildContext = {
                canManageRbac,
                effectiveAccess: MANAGE_ACCESS,
            }
            next()
        })

        setupRbacRoutes(app)
        app.use(errorHandler)

        jest.clearAllMocks()
        ;(sessionService as jest.Mocked<typeof sessionService>).getSession =
            jest.fn().mockResolvedValue(MOCK_SESSION_DATA)
    })

    test('GET /api/guilds/:guildId/rbac returns policy payload for managers', async () => {
        mockListRoleGrants.mockResolvedValue([
            {
                guildId,
                roleId: '222222222222222222',
                module: 'moderation',
                mode: 'view',
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        ])
        mockGetGuildRoleOptions.mockResolvedValue([
            { id: '222222222222222222', name: 'Mods' },
            { id: '333333333333333333', name: 'Helpers' },
        ])

        const response = await request(app)
            .get(`/api/guilds/${guildId}/rbac`)
            .set('Cookie', ['sessionId=valid_session_id'])
            .expect(200)

        expect(mockListRoleGrants).toHaveBeenCalledWith(guildId)
        expect(mockGetGuildRoleOptions).toHaveBeenCalledWith(guildId)
        expect(response.body).toMatchObject({
            guildId,
            modules: [
                'overview',
                'settings',
                'moderation',
                'automation',
                'music',
                'integrations',
            ],
            grants: [
                {
                    roleId: '222222222222222222',
                    module: 'moderation',
                    mode: 'view',
                },
            ],
            roles: [
                { id: '222222222222222222', name: 'Mods' },
                { id: '333333333333333333', name: 'Helpers' },
            ],
            effectiveAccess: MANAGE_ACCESS,
            canManageRbac: true,
        })
    })

    test('GET /api/guilds/:guildId/rbac returns 403 for non-managers', async () => {
        canManageRbac = false

        const response = await request(app)
            .get(`/api/guilds/${guildId}/rbac`)
            .set('Cookie', ['sessionId=valid_session_id'])
            .expect(403)

        expect(response.body).toEqual({
            error: 'RBAC can only be managed by server administrators',
        })
        expect(mockListRoleGrants).not.toHaveBeenCalled()
    })

    test('GET /api/guilds/:guildId/rbac returns 503 when RBAC storage is unavailable', async () => {
        mockListRoleGrants.mockRejectedValue(
            new GuildRoleGrantStorageError('storage unavailable'),
        )

        const response = await request(app)
            .get(`/api/guilds/${guildId}/rbac`)
            .set('Cookie', ['sessionId=valid_session_id'])
            .expect(503)

        expect(response.body).toEqual({
            error: 'RBAC storage is unavailable. Run database migrations and retry.',
        })
    })

    test('PUT /api/guilds/:guildId/rbac validates and persists grants', async () => {
        mockReplaceRoleGrants.mockResolvedValue([
            {
                guildId,
                roleId: '444444444444444444',
                module: 'automation',
                mode: 'manage',
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        ])

        const payload = {
            grants: [
                {
                    roleId: '444444444444444444',
                    module: 'automation',
                    mode: 'manage',
                },
            ],
        }

        const response = await request(app)
            .put(`/api/guilds/${guildId}/rbac`)
            .set('Cookie', ['sessionId=valid_session_id'])
            .send(payload)
            .expect(200)

        expect(mockReplaceRoleGrants).toHaveBeenCalledWith(
            guildId,
            payload.grants,
        )
        expect(response.body).toEqual({
            success: true,
            grants: payload.grants,
        })
    })

    test('PUT /api/guilds/:guildId/rbac returns 400 on invalid grant payload', async () => {
        const response = await request(app)
            .put(`/api/guilds/${guildId}/rbac`)
            .set('Cookie', ['sessionId=valid_session_id'])
            .send({
                grants: [
                    {
                        roleId: 'invalid-role-id',
                        module: 'automation',
                        mode: 'manage',
                    },
                ],
            })
            .expect(400)

        expect(response.body.error).toBe('Validation failed')
        expect(mockReplaceRoleGrants).not.toHaveBeenCalled()
    })

    test('PUT /api/guilds/:guildId/rbac returns 403 for non-managers', async () => {
        canManageRbac = false

        await request(app)
            .put(`/api/guilds/${guildId}/rbac`)
            .set('Cookie', ['sessionId=valid_session_id'])
            .send({
                grants: [
                    {
                        roleId: '444444444444444444',
                        module: 'automation',
                        mode: 'manage',
                    },
                ],
            })
            .expect(403)

        expect(mockReplaceRoleGrants).not.toHaveBeenCalled()
    })

    test('PUT /api/guilds/:guildId/rbac returns 503 when RBAC storage is unavailable', async () => {
        mockReplaceRoleGrants.mockRejectedValue(
            new GuildRoleGrantStorageError('storage unavailable'),
        )

        const response = await request(app)
            .put(`/api/guilds/${guildId}/rbac`)
            .set('Cookie', ['sessionId=valid_session_id'])
            .send({
                grants: [
                    {
                        roleId: '444444444444444444',
                        module: 'automation',
                        mode: 'manage',
                    },
                ],
            })
            .expect(503)

        expect(response.body).toEqual({
            error: 'RBAC storage is unavailable. Run database migrations and retry.',
        })
    })
})
