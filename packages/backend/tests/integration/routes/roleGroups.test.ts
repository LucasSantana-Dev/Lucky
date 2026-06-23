import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import request from 'supertest'
import type { Express, Request, Response, NextFunction } from 'express'
import express from 'express'
import type { AuthenticatedRequest } from '../../../src/middleware/auth'

// Mock the RoleGroupService before importing routes
const mockCreateRoleGroup = jest.fn()
const mockGetRoleGroup = jest.fn()
const mockListRoleGroups = jest.fn()
const mockUpdateRoleGroup = jest.fn()
const mockDetachRoleFromGroup = jest.fn()
const mockAddRoleToGroup = jest.fn()

jest.mock('../../../src/services/RoleGroupService', () => ({
    RoleGroupService: jest.fn().mockImplementation(() => ({
        createRoleGroup: mockCreateRoleGroup,
        getRoleGroup: mockGetRoleGroup,
        listRoleGroups: mockListRoleGroups,
        updateRoleGroup: mockUpdateRoleGroup,
        detachRoleFromGroup: mockDetachRoleFromGroup,
        addRoleToGroup: mockAddRoleToGroup,
    })),
}))

jest.mock('../../../src/services/GuildService', () => ({
    guildService: {
        getGuildRoles: jest.fn(),
    },
}))

jest.mock('../../../src/middleware/auth', () => ({
    requireAuth: (
        req: AuthenticatedRequest,
        _res: Response,
        next: NextFunction,
    ) => {
        req.user = {
            id: 'test-discord-id',
            username: 'test',
            discriminator: '0000',
            avatar: null,
        }
        next()
    },
}))

jest.mock('../../../src/middleware/guildAccess', () => ({
    requireGuildModuleAccess:
        (module: string, action: string) =>
        (_req: Request, _res: Response, next: NextFunction) => {
            next()
        },
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    debugLog: jest.fn(),
}))

import { setupRoleGroupsRoutes } from '../../../src/routes/roleGroups'

describe('Role Groups Routes', () => {
    let app: Express
    const originalDiscordToken = process.env.DISCORD_TOKEN

    beforeEach(() => {
        // Set test token
        process.env.DISCORD_TOKEN = 'test-bot-token'
        jest.clearAllMocks()
        mockCreateRoleGroup.mockClear()
        mockGetRoleGroup.mockClear()
        mockListRoleGroups.mockClear()
        mockUpdateRoleGroup.mockClear()
        mockDetachRoleFromGroup.mockClear()
        mockAddRoleToGroup.mockClear()
        app = express()
        app.use(express.json())
        setupRoleGroupsRoutes(app)
    })

    afterAll(() => {
        // Restore original token (delete when it was unset, to avoid storing
        // the literal string "undefined" in process.env).
        if (originalDiscordToken === undefined) {
            delete process.env.DISCORD_TOKEN
        } else {
            process.env.DISCORD_TOKEN = originalDiscordToken
        }
    })

    describe('POST /api/guilds/:guildId/role-groups', () => {
        it('creates a role group with fromMessageId', async () => {
            const guildId = '123456789012345678'
            const mockGroup = {
                id: 'group-1',
                guildId,
                name: 'Test Group',
                color: '0x5865F2',
                hoist: false,
                mentionable: false,
                buttonStyle: 'Primary',
                createdAt: new Date(),
                updatedAt: new Date(),
            }

            mockCreateRoleGroup.mockResolvedValue(mockGroup)

            const messageId = '987654321098765432'
            const res = await request(app)
                .post(`/api/guilds/${guildId}/role-groups`)
                .send({
                    name: 'Test Group',
                    fromMessageId: messageId,
                })

            expect(res.status).toBe(201)
            expect(res.body).toMatchObject({
                guildId,
                name: 'Test Group',
                color: '0x5865F2',
                hoist: false,
                mentionable: false,
                buttonStyle: 'Primary',
            })
            expect(mockCreateRoleGroup).toHaveBeenCalledWith({
                guildId,
                name: 'Test Group',
                fromMessageId: messageId,
            })
        })

        it('creates a standalone role group', async () => {
            const guildId = '123456789012345678'
            const mockGroup = {
                id: 'group-1',
                guildId,
                name: 'Test Group',
                color: null,
                hoist: false,
                mentionable: false,
                buttonStyle: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            }

            mockCreateRoleGroup.mockResolvedValue(mockGroup)

            const res = await request(app)
                .post(`/api/guilds/${guildId}/role-groups`)
                .send({
                    name: 'Test Group',
                })

            expect(res.status).toBe(201)
            expect(res.body).toMatchObject({
                guildId,
                name: 'Test Group',
                color: null,
                hoist: false,
                mentionable: false,
                buttonStyle: null,
            })
        })

        it('returns 400 when name is missing', async () => {
            const guildId = '123456789012345678'

            const res = await request(app)
                .post(`/api/guilds/${guildId}/role-groups`)
                .send({})

            expect(res.status).toBe(400)
        })

        it('returns 409 when message already has a group', async () => {
            const guildId = '123456789012345678'
            const messageId = '876543210987654321'

            mockCreateRoleGroup.mockRejectedValue(new Error('already-grouped'))

            const res = await request(app)
                .post(`/api/guilds/${guildId}/role-groups`)
                .send({
                    name: 'Test Group',
                    fromMessageId: messageId,
                })

            expect(res.status).toBe(409)
        })
    })

    describe('GET /api/guilds/:guildId/role-groups', () => {
        it('lists role groups', async () => {
            const guildId = '123456789012345678'
            const mockGroups = [
                {
                    id: 'group-1',
                    guildId,
                    name: 'Group 1',
                    color: '0x5865F2',
                    hoist: false,
                    mentionable: false,
                    buttonStyle: 'Primary',
                },
            ]

            mockListRoleGroups.mockResolvedValue(mockGroups)

            const res = await request(app).get(
                `/api/guilds/${guildId}/role-groups`,
            )

            expect(res.status).toBe(200)
            expect(res.body).toEqual({ groups: mockGroups })
        })
    })

    describe('GET /api/guilds/:guildId/role-groups/:id', () => {
        it('returns a role group by id', async () => {
            const guildId = '123456789012345678'
            const groupId = 'group-1'
            const mockGroup = {
                id: groupId,
                guildId,
                name: 'Test Group',
                color: '0x5865F2',
                hoist: false,
                mentionable: false,
                buttonStyle: 'Primary',
            }

            mockGetRoleGroup.mockResolvedValue(mockGroup)

            const res = await request(app).get(
                `/api/guilds/${guildId}/role-groups/${groupId}`,
            )

            expect(res.status).toBe(200)
            expect(res.body).toEqual(mockGroup)
        })

        it('returns 404 when group not found', async () => {
            const guildId = '123456789012345678'
            const groupId = 'group-not-found'

            mockGetRoleGroup.mockResolvedValue(null)

            const res = await request(app).get(
                `/api/guilds/${guildId}/role-groups/${groupId}`,
            )

            expect(res.status).toBe(404)
        })
    })

    describe('PATCH /api/guilds/:guildId/role-groups/:id', () => {
        it('updates the role group style template', async () => {
            const guildId = '123456789012345678'
            const groupId = 'group-1'
            const mockGroup = {
                id: groupId,
                guildId,
                name: 'Test Group',
                color: '0xFF0000',
                hoist: true,
                mentionable: false,
                buttonStyle: 'Success',
            }

            mockUpdateRoleGroup.mockResolvedValue(mockGroup)

            const res = await request(app)
                .patch(`/api/guilds/${guildId}/role-groups/${groupId}`)
                .send({
                    color: '0xFF0000',
                    hoist: true,
                    buttonStyle: 'Success',
                })

            expect(res.status).toBe(200)
            expect(res.body).toEqual(mockGroup)
        })

        it('returns 400 when color format is invalid', async () => {
            const guildId = '123456789012345678'
            const groupId = 'group-1'

            const res = await request(app)
                .patch(`/api/guilds/${guildId}/role-groups/${groupId}`)
                .send({
                    color: 'invalid-color',
                })

            expect(res.status).toBe(400)
        })

        it('returns 404 when group not found', async () => {
            const guildId = '123456789012345678'
            const groupId = 'group-not-found'

            mockUpdateRoleGroup.mockResolvedValue(null)

            const res = await request(app)
                .patch(`/api/guilds/${guildId}/role-groups/${groupId}`)
                .send({
                    color: '0xFF0000',
                })

            expect(res.status).toBe(404)
        })
    })

    describe('POST /api/guilds/:guildId/role-groups/:id/roles', () => {
        it('returns dry-run plan without mutations', async () => {
            const guildId = '123456789012345678'
            const groupId = 'group-1'
            const mockPlan = {
                plan: {
                    roleName: 'New Role',
                    resolvedColorHex: '0x5865F2',
                    resolvedColorInt: 5793266,
                    buttonStyle: 'Primary',
                    willCreateRole: true,
                    willAddButton: true,
                },
            }

            mockAddRoleToGroup.mockResolvedValue(mockPlan)

            const res = await request(app)
                .post(`/api/guilds/${guildId}/role-groups/${groupId}/roles`)
                .set('Authorization', 'Bearer token')
                .send({
                    name: 'New Role',
                    label: 'New Role Button',
                    dryRun: true,
                })

            expect(res.status).toBe(200)
            expect(res.body).toEqual(mockPlan)
            expect(mockAddRoleToGroup).toHaveBeenCalled()
        })

        it('applies add-role and returns role + mapping', async () => {
            const guildId = '123456789012345678'
            const groupId = 'group-1'
            const mockResult = {
                status: 'ok',
                role: {
                    id: 'role-123',
                    name: 'New Role',
                    color: 5793266,
                    hoist: false,
                    mentionable: false,
                },
                mapping: {
                    id: 'mapping-1',
                    roleId: 'role-123',
                    label: 'New Role Button',
                    emoji: null,
                    style: 'Primary',
                },
            }

            mockAddRoleToGroup.mockResolvedValue(mockResult)

            const res = await request(app)
                .post(`/api/guilds/${guildId}/role-groups/${groupId}/roles`)
                .send({
                    name: 'New Role',
                    label: 'New Role Button',
                })

            expect(res.status).toBe(200)
            expect(res.body).toEqual(mockResult)
        })

        it('returns 400 when label exceeds 80 chars', async () => {
            const guildId = '123456789012345678'
            const groupId = 'group-1'

            const res = await request(app)
                .post(`/api/guilds/${guildId}/role-groups/${groupId}/roles`)
                .send({
                    name: 'New Role',
                    label: 'a'.repeat(81),
                })

            expect(res.status).toBe(400)
        })

        it('returns 400 when color format is invalid', async () => {
            const guildId = '123456789012345678'
            const groupId = 'group-1'

            const res = await request(app)
                .post(`/api/guilds/${guildId}/role-groups/${groupId}/roles`)
                .send({
                    name: 'New Role',
                    colorOverride: 'not-hex',
                })

            expect(res.status).toBe(400)
        })

        it('returns 409 when message has 25 buttons (capacity exceeded)', async () => {
            const guildId = '123456789012345678'
            const groupId = 'group-1'

            mockAddRoleToGroup.mockRejectedValue(new Error('25-buttons'))

            const res = await request(app)
                .post(`/api/guilds/${guildId}/role-groups/${groupId}/roles`)
                .send({
                    name: 'New Role',
                })

            expect(res.status).toBe(409)
        })

        it('returns 409 when guild has 250 roles (limit reached)', async () => {
            const guildId = '123456789012345678'
            const groupId = 'group-1'

            mockAddRoleToGroup.mockRejectedValue(new Error('250-roles'))

            const res = await request(app)
                .post(`/api/guilds/${guildId}/role-groups/${groupId}/roles`)
                .send({
                    name: 'New Role',
                })

            expect(res.status).toBe(409)
        })

        it('returns 409 when role name already exists in message (double-submit)', async () => {
            const guildId = '123456789012345678'
            const groupId = 'group-1'

            mockAddRoleToGroup.mockRejectedValue(new Error('duplicate-name'))

            const res = await request(app)
                .post(`/api/guilds/${guildId}/role-groups/${groupId}/roles`)
                .send({
                    name: 'Existing Role',
                })

            expect(res.status).toBe(409)
        })

        it('returns 404 when group not found', async () => {
            const guildId = '123456789012345678'
            const groupId = 'group-not-found'

            mockAddRoleToGroup.mockRejectedValue(new Error('not-found'))

            const res = await request(app)
                .post(`/api/guilds/${guildId}/role-groups/${groupId}/roles`)
                .send({
                    name: 'New Role',
                })

            expect(res.status).toBe(404)
        })

        it('returns 200 with partial_success status when Discord PATCH fails', async () => {
            const guildId = '123456789012345678'
            const groupId = 'group-1'
            const mockResult = {
                status: 'partial_success',
                role: {
                    id: 'role-123',
                    name: 'New Role',
                    color: 5793266,
                    hoist: false,
                    mentionable: false,
                },
                mapping: {
                    id: 'mapping-1',
                    roleId: 'role-123',
                    label: 'New Role Button',
                    emoji: null,
                    style: 'Primary',
                },
            }

            mockAddRoleToGroup.mockResolvedValue(mockResult)

            const res = await request(app)
                .post(`/api/guilds/${guildId}/role-groups/${groupId}/roles`)
                .send({
                    name: 'New Role',
                })

            expect(res.status).toBe(200)
            expect(res.body.status).toBe('partial_success')
        })
    })

    describe('DELETE /api/guilds/:guildId/role-groups/:id/roles/:roleId', () => {
        it('detaches a role from the group message', async () => {
            const guildId = '123456789012345678'
            const groupId = 'group-1'
            const roleId = '999888777666555444'

            mockDetachRoleFromGroup.mockResolvedValue(true)

            const res = await request(app).delete(
                `/api/guilds/${guildId}/role-groups/${groupId}/roles/${roleId}`,
            )

            expect(res.status).toBe(200)
            expect(res.body).toEqual({ success: true })
        })

        it('returns 404 when group not found', async () => {
            const guildId = '123456789012345678'
            const groupId = 'group-not-found'
            const roleId = '999888777666555444'

            mockDetachRoleFromGroup.mockResolvedValue(false)

            const res = await request(app).delete(
                `/api/guilds/${guildId}/role-groups/${groupId}/roles/${roleId}`,
            )

            expect(res.status).toBe(404)
        })

        it('returns 404 when role not found in group', async () => {
            const guildId = '123456789012345678'
            const groupId = 'group-1'
            const roleId = '111222333444555666'

            mockDetachRoleFromGroup.mockResolvedValue(false)

            const res = await request(app).delete(
                `/api/guilds/${guildId}/role-groups/${groupId}/roles/${roleId}`,
            )

            expect(res.status).toBe(404)
        })
    })
})
