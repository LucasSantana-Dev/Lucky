import { errorHandler } from '../../../src/middleware/errorHandler'
import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupRolesRoutes } from '../../../src/routes/roles'
import { setupSessionMiddleware } from '../../../src/middleware/session'
import { sessionService } from '../../../src/services/SessionService'
import { guildAccessService } from '../../../src/services/GuildAccessService'
import { requireAuth } from '../../../src/middleware/auth'
import { requireGuildModuleAccess } from '../../../src/middleware/guildAccess'
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

const mockListReactionRoles = jest.fn<any>()
const mockListExclusiveRoles = jest.fn<any>()
const mockCreateReactionRole = jest.fn<any>()
const mockDeleteReactionRole = jest.fn<any>()

jest.mock('@lucky/shared/services', () => ({
    reactionRolesService: {
        listReactionRoleMessages: (...args: any[]) =>
            mockListReactionRoles(...args),
        createReactionRoleMessageFromDashboard: (...args: any[]) =>
            mockCreateReactionRole(...args),
        deleteReactionRoleMessage: (...args: any[]) =>
            mockDeleteReactionRole(...args),
    },
    roleManagementService: {
        listExclusiveRoles: (...args: any[]) => mockListExclusiveRoles(...args),
    },
}))

const mockGetFullGuildRoles = jest.fn<any>()
const mockCreateGuildRole = jest.fn<any>()
const mockUpdateGuildRole = jest.fn<any>()
const mockDeleteGuildRole = jest.fn<any>()
const mockHasBotInGuild = jest.fn<any>()
const mockGetGuildMemberContext = jest.fn<any>()
const mockGetBotHighestRolePosition = jest.fn<any>()

jest.mock('../../../src/services/GuildService', () => ({
    guildService: {
        getFullGuildRoles: (...args: any[]) => mockGetFullGuildRoles(...args),
        createGuildRole: (...args: any[]) => mockCreateGuildRole(...args),
        updateGuildRole: (...args: any[]) => mockUpdateGuildRole(...args),
        deleteGuildRole: (...args: any[]) => mockDeleteGuildRole(...args),
        hasBotInGuild: (...args: any[]) => mockHasBotInGuild(...args),
        getGuildMemberContext: (...args: any[]) =>
            mockGetGuildMemberContext(...args),
        getBotHighestRolePosition: (...args: any[]) =>
            mockGetBotHighestRolePosition(...args),
    },
}))

describe('Roles Routes', () => {
    let app: express.Express

    beforeEach(() => {
        app = express()
        app.use(express.json())
        setupSessionMiddleware(app)
        // Mirrors the `/roles/manage` guildGuardConfigs entry in
        // routes/index.ts (production populates req.guildContext here,
        // before roles.ts's handlers run) - without it, requests never
        // reach the manage endpoints' permission-cap checks (#2451).
        app.use(
            '/api/guilds/:guildId/roles/manage',
            requireAuth,
            requireGuildModuleAccess('settings', 'manage'),
        )
        setupRolesRoutes(app)
        app.use(errorHandler)
        jest.clearAllMocks()
        process.env.DISCORD_TOKEN = 'test-token-default'
        mockGetFullGuildRoles.mockResolvedValue([])
        // Only reached when a requester's real roles were never preloaded
        // (roleDataAvailable=false, e.g. the dashboard's MANAGE_GUILD-only
        // admin) - default to "found" so tests that don't care about this
        // path aren't forced to mock it (#2451 review, gap 1).
        mockHasBotInGuild.mockResolvedValue(true)
        // null = bot position unknown: the bot-hierarchy check is skipped.
        mockGetBotHighestRolePosition.mockResolvedValue(null)
        mockGetGuildMemberContext.mockResolvedValue({
            nickname: null,
            roleIds: [],
        })
    })

    const GUILD_ID = '111111111111111111'

    function authed(guildContextOverrides: Record<string, unknown> = {}) {
        const sessionMock = sessionService as jest.Mocked<typeof sessionService>
        sessionMock.getSession.mockResolvedValue(MOCK_SESSION_DATA)

        const accessMock = guildAccessService as jest.Mocked<
            typeof guildAccessService
        >
        accessMock.resolveGuildContext.mockResolvedValue({
            guildId: GUILD_ID,
            userId: MOCK_SESSION_DATA.userId,
            owner: false,
            isAdmin: false,
            hasBot: true,
            botPresenceChecked: true,
            roleIds: [],
            nickname: null,
            effectiveAccess: {},
            canManageRbac: false,
            // Raw Discord permissions bitfield the member holds (#2451);
            // defaults to none so tests opt in explicitly to what a
            // non-admin requester is allowed to grant.
            permissions: '0',
            ...guildContextOverrides,
        } as any)
        accessMock.hasAccess.mockReturnValue(true)
    }

    describe('GET /api/guilds/:guildId/reaction-roles', () => {
        test('should list reaction role messages', async () => {
            authed()
            const messages = [
                {
                    id: 'rrm-1',
                    messageId: '555555555555555555',
                    channelId: '444444444444444444',
                    guildId: GUILD_ID,
                    mappings: [
                        {
                            roleId: '666666666666666666',
                            label: 'Red Team',
                        },
                    ],
                },
            ]
            mockListReactionRoles.mockResolvedValue(messages)

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/reaction-roles`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
            expect(res.body.messages).toHaveLength(1)
            expect(mockListReactionRoles).toHaveBeenCalledWith(GUILD_ID)
        })

        test('should return 401 without auth', async () => {
            const mock = sessionService as jest.Mocked<typeof sessionService>
            mock.getSession.mockResolvedValue(null)

            const res = await request(app).get(
                `/api/guilds/${GUILD_ID}/reaction-roles`,
            )

            expect(res.status).toBe(401)
        })
    })

    describe('POST /api/guilds/:guildId/reaction-roles', () => {
        const CHANNEL_ID = '222222222222222222'
        const ROLE_ID = '333333333333333333'
        const validPayload = {
            channelId: CHANNEL_ID,
            title: 'Test Roles',
            description: 'Test description',
            roles: [
                {
                    roleId: ROLE_ID,
                    label: 'Test Role',
                    emoji: '✅',
                    style: 'Primary' as const,
                },
            ],
        }

        test('should create reaction role message when authenticated with valid payload', async () => {
            authed()
            const createdMessage = {
                id: 'rrm-created',
                messageId: '444444444444444444',
                channelId: CHANNEL_ID,
                guildId: GUILD_ID,
                mappings: [
                    {
                        roleId: ROLE_ID,
                        label: 'Test Role',
                    },
                ],
            }
            mockCreateReactionRole.mockResolvedValue(createdMessage)
            process.env.DISCORD_TOKEN = 'test-token'

            const res = await request(app)
                .post(`/api/guilds/${GUILD_ID}/reaction-roles`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send(validPayload)

            expect(res.status).toBe(201)
            expect(res.body).toEqual(createdMessage)
            expect(mockCreateReactionRole).toHaveBeenCalledWith(
                expect.objectContaining({
                    guildId: GUILD_ID,
                    channelId: CHANNEL_ID,
                    title: 'Test Roles',
                    description: 'Test description',
                    botToken: 'test-token',
                    roles: expect.any(Array),
                }),
            )
        })

        test('should return 401 without auth', async () => {
            const mock = sessionService as jest.Mocked<typeof sessionService>
            mock.getSession.mockResolvedValue(null)

            const res = await request(app)
                .post(`/api/guilds/${GUILD_ID}/reaction-roles`)
                .send(validPayload)

            expect(res.status).toBe(401)
        })

        test('should return 400 with missing channel ID', async () => {
            authed()
            const invalidPayload = {
                title: 'Test Roles',
                description: 'Test description',
                roles: [
                    {
                        roleId: ROLE_ID,
                        label: 'Test Role',
                    },
                ],
            }

            const res = await request(app)
                .post(`/api/guilds/${GUILD_ID}/reaction-roles`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send(invalidPayload)

            expect(res.status).toBe(400)
        })

        test('should return 400 with empty roles array', async () => {
            authed()
            const invalidPayload = {
                channelId: CHANNEL_ID,
                title: 'Test Roles',
                description: 'Test description',
                roles: [],
            }

            const res = await request(app)
                .post(`/api/guilds/${GUILD_ID}/reaction-roles`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send(invalidPayload)

            expect(res.status).toBe(400)
        })

        test('should return 400 with duplicate role IDs', async () => {
            authed()
            const invalidPayload = {
                channelId: CHANNEL_ID,
                title: 'Test Roles',
                description: 'Test description',
                roles: [
                    {
                        roleId: ROLE_ID,
                        label: 'Test Role',
                    },
                    {
                        roleId: ROLE_ID,
                        label: 'Duplicate Role',
                    },
                ],
            }

            const res = await request(app)
                .post(`/api/guilds/${GUILD_ID}/reaction-roles`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send(invalidPayload)

            expect(res.status).toBe(400)
        })

        test('should return 503 when bot token is not configured', async () => {
            authed()
            process.env.DISCORD_TOKEN = ''

            const res = await request(app)
                .post(`/api/guilds/${GUILD_ID}/reaction-roles`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send(validPayload)

            expect(res.status).toBe(503)
        })

        test('should return 400 with invalid role ID format', async () => {
            authed()
            const invalidPayload = {
                channelId: CHANNEL_ID,
                title: 'Test Roles',
                description: 'Test description',
                roles: [
                    {
                        roleId: 'invalid-id',
                        label: 'Test Role',
                    },
                ],
            }

            const res = await request(app)
                .post(`/api/guilds/${GUILD_ID}/reaction-roles`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send(invalidPayload)

            expect(res.status).toBe(400)
        })

        test('should return 400 with title exceeding max length', async () => {
            authed()
            const invalidPayload = {
                channelId: CHANNEL_ID,
                title: 'a'.repeat(257),
                description: 'Test description',
                roles: [
                    {
                        roleId: ROLE_ID,
                        label: 'Test Role',
                    },
                ],
            }

            const res = await request(app)
                .post(`/api/guilds/${GUILD_ID}/reaction-roles`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send(invalidPayload)

            expect(res.status).toBe(400)
        })
    })

    describe('DELETE /api/guilds/:guildId/reaction-roles/:messageId', () => {
        const MESSAGE_ID = '555555555555555555'

        test('should delete reaction role message when authenticated', async () => {
            authed()
            mockDeleteReactionRole.mockResolvedValue(true)

            const res = await request(app)
                .delete(`/api/guilds/${GUILD_ID}/reaction-roles/${MESSAGE_ID}`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
            expect(res.body).toEqual({ success: true })
            expect(mockDeleteReactionRole).toHaveBeenCalledWith(
                MESSAGE_ID,
                GUILD_ID,
            )
        })

        test('should return 401 without auth', async () => {
            const mock = sessionService as jest.Mocked<typeof sessionService>
            mock.getSession.mockResolvedValue(null)

            const res = await request(app).delete(
                `/api/guilds/${GUILD_ID}/reaction-roles/${MESSAGE_ID}`,
            )

            expect(res.status).toBe(401)
        })

        test('should return 404 when message not found', async () => {
            authed()
            mockDeleteReactionRole.mockResolvedValue(false)

            const res = await request(app)
                .delete(`/api/guilds/${GUILD_ID}/reaction-roles/${MESSAGE_ID}`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(404)
            expect(res.body.error).toBe('Reaction role message not found')
        })

        test('should return 400 with invalid message ID format', async () => {
            authed()

            const res = await request(app)
                .delete(`/api/guilds/${GUILD_ID}/reaction-roles/invalid-id`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(400)
        })

        test('should return 500 when DB error occurs (not record not found)', async () => {
            authed()
            const dbError = new Error('Database connection lost')
            mockDeleteReactionRole.mockRejectedValue(dbError)

            const res = await request(app)
                .delete(`/api/guilds/${GUILD_ID}/reaction-roles/${MESSAGE_ID}`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(500)
            expect(res.body.error).toBeDefined()
        })
    })

    describe('GET /api/guilds/:guildId/roles/exclusive', () => {
        test('should list exclusive role rules', async () => {
            authed()
            const exclusions = [
                {
                    id: 'exc-1',
                    guildId: GUILD_ID,
                    roleId: '777777777777777777',
                    excludedRoleId: '888888888888888888',
                },
            ]
            mockListExclusiveRoles.mockResolvedValue(exclusions)

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/roles/exclusive`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
            expect(res.body.exclusions).toHaveLength(1)
            expect(mockListExclusiveRoles).toHaveBeenCalledWith(GUILD_ID)
        })

        test('should return empty array for guild with no rules', async () => {
            authed()
            mockListExclusiveRoles.mockResolvedValue([])

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/roles/exclusive`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
            expect(res.body.exclusions).toHaveLength(0)
        })
    })

    describe('POST /api/guilds/:guildId/reaction-roles with file upload', () => {
        const CHANNEL_ID = '222222222222222222'
        const ROLE_ID = '333333333333333333'

        test('should create reaction role message with multipart file upload', async () => {
            authed()
            const fakeImageBuffer = Buffer.from('fake-png-data')
            const createdMessage = {
                id: 'rrm-created',
                messageId: '444444444444444444',
                channelId: CHANNEL_ID,
                guildId: GUILD_ID,
                mappings: [],
            }
            mockCreateReactionRole.mockResolvedValue(createdMessage)
            process.env.DISCORD_TOKEN = 'test-token'

            const res = await request(app)
                .post(`/api/guilds/${GUILD_ID}/reaction-roles`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .field(
                    'payload',
                    JSON.stringify({
                        channelId: CHANNEL_ID,
                        title: 'Test Roles',
                        description: 'Test description',
                        roles: [
                            {
                                roleId: ROLE_ID,
                                label: 'Test Role',
                                emoji: '✅',
                                style: 'Primary',
                            },
                        ],
                    }),
                )
                .attach('image', fakeImageBuffer, 'test-image.png')

            expect(res.status).toBe(201)
            expect(res.body).toEqual(createdMessage)
            expect(mockCreateReactionRole).toHaveBeenCalledWith(
                expect.objectContaining({
                    guildId: GUILD_ID,
                    channelId: CHANNEL_ID,
                    imageFile: expect.objectContaining({
                        filename: 'test-image.png',
                    }),
                }),
            )
        })

        test('should reject multipart POST with oversized file', async () => {
            authed()
            // Create an 9MB buffer (exceeds 8MB limit)
            const largeBuffer = Buffer.alloc(9 * 1024 * 1024)
            process.env.DISCORD_TOKEN = 'test-token'

            const res = await request(app)
                .post(`/api/guilds/${GUILD_ID}/reaction-roles`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .field(
                    'payload',
                    JSON.stringify({
                        channelId: CHANNEL_ID,
                        title: 'Test Roles',
                        description: 'Test description',
                        roles: [
                            {
                                roleId: ROLE_ID,
                                label: 'Test Role',
                            },
                        ],
                    }),
                )
                .attach('image', largeBuffer, 'big-file.png')

            expect(res.status).toBe(413)
        })

        test('should reject multipart POST with invalid image mimetype', async () => {
            authed()
            const textBuffer = Buffer.from('not an image')
            process.env.DISCORD_TOKEN = 'test-token'

            const res = await request(app)
                .post(`/api/guilds/${GUILD_ID}/reaction-roles`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .field(
                    'payload',
                    JSON.stringify({
                        channelId: CHANNEL_ID,
                        title: 'Test Roles',
                        description: 'Test description',
                        roles: [
                            {
                                roleId: ROLE_ID,
                                label: 'Test Role',
                            },
                        ],
                    }),
                )
                .attach('image', textBuffer, 'not-an-image.txt')

            expect(res.status).toBe(400)
        })

        test('should still accept normal JSON POST without file', async () => {
            authed()
            const createdMessage = {
                id: 'rrm-created',
                messageId: '444444444444444444',
                channelId: CHANNEL_ID,
                guildId: GUILD_ID,
                mappings: [],
            }
            mockCreateReactionRole.mockResolvedValue(createdMessage)
            process.env.DISCORD_TOKEN = 'test-token'

            const res = await request(app)
                .post(`/api/guilds/${GUILD_ID}/reaction-roles`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({
                    channelId: CHANNEL_ID,
                    title: 'Test Roles',
                    description: 'Test description',
                    roles: [
                        {
                            roleId: ROLE_ID,
                            label: 'Test Role',
                        },
                    ],
                })

            expect(res.status).toBe(201)
            expect(mockCreateReactionRole).toHaveBeenCalledWith(
                expect.objectContaining({
                    guildId: GUILD_ID,
                    channelId: CHANNEL_ID,
                    imageFile: undefined,
                }),
            )
        })
    })

    describe('PUT /api/guilds/:guildId/reaction-roles/:messageId with file upload', () => {
        const MESSAGE_ID = '555555555555555555'
        const ROLE_ID = '333333333333333333'

        test('should update reaction role message with multipart file upload', async () => {
            authed()
            const fakeImageBuffer = Buffer.from('updated-png-data')
            process.env.DISCORD_TOKEN = 'test-token'

            const mockUpdateReactionRole = jest.fn()
            ;(
                jest.mocked(
                    require('@lucky/shared/services').reactionRolesService,
                ) as any
            ).updateReactionRoleMessage = mockUpdateReactionRole

            mockUpdateReactionRole.mockResolvedValue({ messageId: MESSAGE_ID })

            const res = await request(app)
                .put(`/api/guilds/${GUILD_ID}/reaction-roles/${MESSAGE_ID}`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .field(
                    'payload',
                    JSON.stringify({
                        title: 'Updated Roles',
                        description: 'Updated description',
                        roles: [
                            {
                                roleId: ROLE_ID,
                                label: 'Updated Role',
                            },
                        ],
                    }),
                )
                .attach('image', fakeImageBuffer, 'updated-image.png')

            expect(res.status).toBe(200)
            expect(res.body).toEqual({ messageId: MESSAGE_ID })
        })
    })

    describe('PUT reaction-roles unexpected errors', () => {
        const MESSAGE_ID = '555555555555555555'
        const body = {
            title: 'T',
            description: 'D',
            roles: [{ roleId: '333333333333333333', label: 'L' }],
        }
        const put = () =>
            request(app)
                .put(`/api/guilds/${GUILD_ID}/reaction-roles/${MESSAGE_ID}`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send(body)

        function failUpdateWith(message: string) {
            authed()
            process.env.DISCORD_TOKEN = 'test-token'
            ;(
                jest.mocked(
                    require('@lucky/shared/services').reactionRolesService,
                ) as any
            ).updateReactionRoleMessage = jest
                .fn()
                .mockRejectedValue(new Error(message))
        }

        test('returns a generic 500 without leaking the raw error text', async () => {
            failUpdateWith('Invalid `prisma.reactionRole.update()` invocation')
            const res = await put()
            expect(res.status).toBe(500)
            expect(res.body.error).toBe(
                'Failed to update reaction role message',
            )
            expect(JSON.stringify(res.body)).not.toMatch(/prisma/)
        })

        test('keeps mapping a missing message to 404', async () => {
            failUpdateWith('Reaction role message not found')
            expect((await put()).status).toBe(404)
        })

        test('keeps mapping Discord API errors to 502', async () => {
            failUpdateWith('Discord API error 500')
            expect((await put()).status).toBe(502)
        })
    })

    describe('bot role hierarchy (#2420)', () => {
        const CHANNEL_ID = '222222222222222222'
        const LOW_ROLE = '333333333333333333'
        const HIGH_ROLE = '666666666666666666'
        const MESSAGE_ID = '555555555555555555'
        const fullRole = (id: string, position: number) => ({
            id,
            name: `role-${id}`,
            color: 0,
            hoist: false,
            mentionable: false,
            permissions: '0',
            position,
            managed: false,
        })
        const reactionPayload = (roleId: string) => ({
            channelId: CHANNEL_ID,
            title: 'T',
            description: 'D',
            roles: [{ roleId, label: 'L' }],
        })

        beforeEach(() => {
            process.env.DISCORD_TOKEN = 'test-token'
            mockGetBotHighestRolePosition.mockResolvedValue(5)
            mockListReactionRoles.mockResolvedValue([])
            // A successful update, so a 400 can only come from the guard.
            ;(
                require('@lucky/shared/services').reactionRolesService as any
            ).updateReactionRoleMessage = jest
                .fn<any>()
                .mockResolvedValue({ messageId: MESSAGE_ID })
            mockGetFullGuildRoles.mockResolvedValue([
                fullRole(LOW_ROLE, 2),
                fullRole(HIGH_ROLE, 5),
            ])
        })

        test('POST reaction-roles rejects a role at or above the bot highest role', async () => {
            authed()
            const res = await request(app)
                .post(`/api/guilds/${GUILD_ID}/reaction-roles`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send(reactionPayload(HIGH_ROLE))

            expect(res.status).toBe(400)
            expect(res.body.error).toMatch(/at or above the bot's highest role/)
            expect(mockCreateReactionRole).not.toHaveBeenCalled()
        })

        test('POST reaction-roles accepts a role below the bot highest role', async () => {
            authed()
            mockCreateReactionRole.mockResolvedValue({ messageId: MESSAGE_ID })
            const res = await request(app)
                .post(`/api/guilds/${GUILD_ID}/reaction-roles`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send(reactionPayload(LOW_ROLE))

            expect(res.status).toBe(201)
        })

        test('POST reaction-roles skips the check when the bot position is unknown', async () => {
            authed()
            mockGetBotHighestRolePosition.mockResolvedValue(null)
            mockCreateReactionRole.mockResolvedValue({ messageId: MESSAGE_ID })
            const res = await request(app)
                .post(`/api/guilds/${GUILD_ID}/reaction-roles`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send(reactionPayload(HIGH_ROLE))

            expect(res.status).toBe(201)
        })

        test('PUT reaction-roles rejects a role at or above the bot highest role', async () => {
            authed()
            const { roles, ...rest } = reactionPayload(HIGH_ROLE)
            const res = await request(app)
                .put(`/api/guilds/${GUILD_ID}/reaction-roles/${MESSAGE_ID}`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({
                    title: rest.title,
                    description: rest.description,
                    roles,
                })

            expect(res.status).toBe(400)
            expect(res.body.error).toMatch(/at or above the bot's highest role/)
        })

        test('PUT reaction-roles allows keeping an already bound role that is now above the bot', async () => {
            authed()
            mockListReactionRoles.mockResolvedValue([
                {
                    messageId: MESSAGE_ID,
                    mappings: [{ roleId: HIGH_ROLE }],
                },
            ])
            const updateMock = jest.fn<any>().mockResolvedValue({
                messageId: MESSAGE_ID,
            })
            ;(
                require('@lucky/shared/services').reactionRolesService as any
            ).updateReactionRoleMessage = updateMock

            const res = await request(app)
                .put(`/api/guilds/${GUILD_ID}/reaction-roles/${MESSAGE_ID}`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({
                    title: 'New title',
                    description: 'D',
                    roles: [{ roleId: HIGH_ROLE, label: 'L' }],
                })

            expect(res.status).toBe(200)
            expect(updateMock).toHaveBeenCalled()
        })

        test('PUT reaction-roles still rejects adding a new role above the bot', async () => {
            authed()
            mockListReactionRoles.mockResolvedValue([
                {
                    messageId: MESSAGE_ID,
                    mappings: [{ roleId: LOW_ROLE }],
                },
            ])

            const res = await request(app)
                .put(`/api/guilds/${GUILD_ID}/reaction-roles/${MESSAGE_ID}`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({
                    title: 'T',
                    description: 'D',
                    roles: [
                        { roleId: LOW_ROLE, label: 'L' },
                        { roleId: HIGH_ROLE, label: 'H' },
                    ],
                })

            expect(res.status).toBe(400)
            expect(res.body.error).toMatch(/at or above the bot's highest role/)
        })

        test('PATCH roles/manage rejects editing a role at or above the bot highest role', async () => {
            authed({ owner: true })
            const res = await request(app)
                .patch(`/api/guilds/${GUILD_ID}/roles/manage/${HIGH_ROLE}`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ name: 'Renamed' })

            expect(res.status).toBe(400)
            expect(res.body.error).toMatch(/at or above the bot's highest role/)
            expect(mockUpdateGuildRole).not.toHaveBeenCalled()
        })
    })

    // #2451: /roles/manage accepts an arbitrary Discord permissions
    // bitfield. A dashboard user with only settings:manage (not Discord
    // Administrator/owner) must not be able to grant a role permission bits
    // they do not hold themselves, or touch a role at/above their own
    // highest role.
    describe('Role permission cap (#2451)', () => {
        const ROLE_ID = '999999999999999999'
        const ADMINISTRATOR = '8'
        const KICK_MEMBERS = '2'
        const MANAGE_GUILD = '32'
        const MANAGE_ROLES = '268435456' // 0x10000000
        const MY_ROLE_ID = '444444444444444444'

        // A non-admin, non-owner write always needs MANAGE_ROLES on top of
        // whatever bit a test is exercising for the permission cap itself
        // (#2451 review, gap 2) - this keeps those tests focused on the
        // cap/hierarchy logic instead of tripping the MANAGE_ROLES gate.
        function combineBits(...bits: string[]): string {
            return bits
                .reduce((acc, bit) => acc | BigInt(bit), BigInt(0))
                .toString()
        }

        function roleFixture(overrides: Record<string, unknown> = {}) {
            return {
                id: ROLE_ID,
                name: 'Target Role',
                color: 0,
                hoist: false,
                mentionable: false,
                permissions: '0',
                position: 1,
                managed: false,
                ...overrides,
            }
        }

        describe('POST /api/guilds/:guildId/roles/manage', () => {
            test('rejects a non-admin granting Administrator they do not hold', async () => {
                authed({ permissions: combineBits(KICK_MEMBERS, MANAGE_ROLES) })

                const res = await request(app)
                    .post(`/api/guilds/${GUILD_ID}/roles/manage`)
                    .set('Cookie', ['sessionId=valid_session_id'])
                    .send({ name: 'New Role', permissions: ADMINISTRATOR })

                expect(res.status).toBe(403)
                expect(mockCreateGuildRole).not.toHaveBeenCalled()
            })

            test('allows a non-admin granting a bit they hold', async () => {
                authed({ permissions: combineBits(KICK_MEMBERS, MANAGE_ROLES) })
                mockCreateGuildRole.mockResolvedValue(
                    roleFixture({ permissions: KICK_MEMBERS }),
                )

                const res = await request(app)
                    .post(`/api/guilds/${GUILD_ID}/roles/manage`)
                    .set('Cookie', ['sessionId=valid_session_id'])
                    .send({ name: 'New Role', permissions: KICK_MEMBERS })

                expect(res.status).toBe(201)
                expect(mockCreateGuildRole).toHaveBeenCalledWith(
                    GUILD_ID,
                    expect.objectContaining({ permissions: KICK_MEMBERS }),
                )
            })

            test('rejects a non-admin lacking MANAGE_ROLES even when they hold the requested permission bit', async () => {
                // On Discord, MANAGE_GUILD (or any other single permission)
                // does not let a member touch roles at all without
                // MANAGE_ROLES (#2451 review, gap 2).
                authed({ permissions: KICK_MEMBERS })

                const res = await request(app)
                    .post(`/api/guilds/${GUILD_ID}/roles/manage`)
                    .set('Cookie', ['sessionId=valid_session_id'])
                    .send({ name: 'New Role', permissions: KICK_MEMBERS })

                expect(res.status).toBe(403)
                expect(mockCreateGuildRole).not.toHaveBeenCalled()
            })

            test('rejects a MANAGE_GUILD-only admin lacking MANAGE_ROLES', async () => {
                authed({
                    permissions: MANAGE_GUILD,
                    roleIds: [],
                    botPresenceChecked: false,
                })

                const res = await request(app)
                    .post(`/api/guilds/${GUILD_ID}/roles/manage`)
                    .set('Cookie', ['sessionId=valid_session_id'])
                    .send({ name: 'New Role' })

                expect(res.status).toBe(403)
                expect(mockCreateGuildRole).not.toHaveBeenCalled()
            })

            test('allows the guild owner to grant Administrator', async () => {
                authed({ owner: true, permissions: '0' })
                mockCreateGuildRole.mockResolvedValue(
                    roleFixture({ permissions: ADMINISTRATOR }),
                )

                const res = await request(app)
                    .post(`/api/guilds/${GUILD_ID}/roles/manage`)
                    .set('Cookie', ['sessionId=valid_session_id'])
                    .send({ name: 'New Role', permissions: ADMINISTRATOR })

                expect(res.status).toBe(201)
            })

            test('allows a true Administrator holder to grant Administrator', async () => {
                authed({ permissions: ADMINISTRATOR })
                mockCreateGuildRole.mockResolvedValue(
                    roleFixture({ permissions: ADMINISTRATOR }),
                )

                const res = await request(app)
                    .post(`/api/guilds/${GUILD_ID}/roles/manage`)
                    .set('Cookie', ['sessionId=valid_session_id'])
                    .send({ name: 'New Role', permissions: ADMINISTRATOR })

                expect(res.status).toBe(201)
            })
        })

        describe('PATCH /api/guilds/:guildId/roles/manage/:roleId', () => {
            test('rejects a non-admin granting Administrator they do not hold', async () => {
                authed({
                    permissions: combineBits(KICK_MEMBERS, MANAGE_ROLES),
                    roleIds: [MY_ROLE_ID],
                })
                mockGetFullGuildRoles.mockResolvedValue([
                    roleFixture({ position: 1 }),
                    { id: MY_ROLE_ID, position: 5 },
                ])

                const res = await request(app)
                    .patch(`/api/guilds/${GUILD_ID}/roles/manage/${ROLE_ID}`)
                    .set('Cookie', ['sessionId=valid_session_id'])
                    .send({ name: 'Renamed', permissions: ADMINISTRATOR })

                expect(res.status).toBe(403)
                expect(mockUpdateGuildRole).not.toHaveBeenCalled()
            })

            test('rejects editing a role positioned at or above the requester highest role', async () => {
                authed({
                    permissions: combineBits(KICK_MEMBERS, MANAGE_ROLES),
                    roleIds: [MY_ROLE_ID],
                })
                mockGetFullGuildRoles.mockResolvedValue([
                    roleFixture({ position: 9 }),
                    { id: MY_ROLE_ID, position: 5 },
                ])

                const res = await request(app)
                    .patch(`/api/guilds/${GUILD_ID}/roles/manage/${ROLE_ID}`)
                    .set('Cookie', ['sessionId=valid_session_id'])
                    .send({ name: 'Renamed' })

                expect(res.status).toBe(403)
                expect(mockUpdateGuildRole).not.toHaveBeenCalled()
            })

            test('allows editing a role below the requester highest role with a held permission bit', async () => {
                authed({
                    permissions: combineBits(KICK_MEMBERS, MANAGE_ROLES),
                    roleIds: [MY_ROLE_ID],
                })
                mockGetFullGuildRoles.mockResolvedValue([
                    roleFixture({ position: 1 }),
                    { id: MY_ROLE_ID, position: 5 },
                ])
                mockUpdateGuildRole.mockResolvedValue(
                    roleFixture({ permissions: KICK_MEMBERS }),
                )

                const res = await request(app)
                    .patch(`/api/guilds/${GUILD_ID}/roles/manage/${ROLE_ID}`)
                    .set('Cookie', ['sessionId=valid_session_id'])
                    .send({ name: 'Renamed', permissions: KICK_MEMBERS })

                expect(res.status).toBe(200)
                expect(mockUpdateGuildRole).toHaveBeenCalled()
            })

            test('allows the guild owner to edit a role above every other member', async () => {
                authed({ owner: true, permissions: '0', roleIds: [] })
                mockGetFullGuildRoles.mockResolvedValue([
                    roleFixture({ position: 50 }),
                ])
                mockUpdateGuildRole.mockResolvedValue(roleFixture())

                const res = await request(app)
                    .patch(`/api/guilds/${GUILD_ID}/roles/manage/${ROLE_ID}`)
                    .set('Cookie', ['sessionId=valid_session_id'])
                    .send({ name: 'Renamed', permissions: ADMINISTRATOR })

                expect(res.status).toBe(200)
            })

            test('rejects a MANAGE_GUILD-only admin lacking MANAGE_ROLES', async () => {
                authed({
                    permissions: MANAGE_GUILD,
                    roleIds: [],
                    botPresenceChecked: false,
                })

                const res = await request(app)
                    .patch(`/api/guilds/${GUILD_ID}/roles/manage/${ROLE_ID}`)
                    .set('Cookie', ['sessionId=valid_session_id'])
                    .send({ name: 'Renamed' })

                expect(res.status).toBe(403)
                expect(mockUpdateGuildRole).not.toHaveBeenCalled()
            })

            test('a MANAGE_ROLES holder whose real roles were never preloaded is still hierarchy-checked', async () => {
                // GuildAccessService short-circuits the member-role lookup
                // for the dashboard's broader isAdmin (MANAGE_GUILD alone
                // satisfies it), so roleIds is [] and botPresenceChecked is
                // false for them - that must trigger an on-demand fetch of
                // their real roles, not a skip of the hierarchy check
                // (#2451 review, gap 1).
                authed({
                    permissions: combineBits(MANAGE_GUILD, MANAGE_ROLES),
                    roleIds: [],
                    botPresenceChecked: false,
                })
                mockGetGuildMemberContext.mockResolvedValue({
                    nickname: null,
                    roleIds: [MY_ROLE_ID],
                })
                mockGetFullGuildRoles.mockResolvedValue([
                    roleFixture({ position: 9 }),
                    { id: MY_ROLE_ID, position: 5 },
                ])

                const res = await request(app)
                    .patch(`/api/guilds/${GUILD_ID}/roles/manage/${ROLE_ID}`)
                    .set('Cookie', ['sessionId=valid_session_id'])
                    .send({ name: 'Renamed' })

                expect(res.status).toBe(403)
                expect(mockGetGuildMemberContext).toHaveBeenCalledWith(
                    GUILD_ID,
                    expect.any(String),
                )
                expect(mockUpdateGuildRole).not.toHaveBeenCalled()
            })

            test('fails closed (403) when the on-demand member fetch cannot confirm bot presence', async () => {
                authed({
                    permissions: combineBits(MANAGE_GUILD, MANAGE_ROLES),
                    roleIds: [],
                    botPresenceChecked: false,
                })
                mockHasBotInGuild.mockResolvedValue(false)
                mockGetFullGuildRoles.mockResolvedValue([
                    roleFixture({ position: 1 }),
                ])

                const res = await request(app)
                    .patch(`/api/guilds/${GUILD_ID}/roles/manage/${ROLE_ID}`)
                    .set('Cookie', ['sessionId=valid_session_id'])
                    .send({ name: 'Renamed' })

                expect(res.status).toBe(403)
                expect(mockUpdateGuildRole).not.toHaveBeenCalled()
            })
        })

        describe('DELETE /api/guilds/:guildId/roles/manage/:roleId', () => {
            test('rejects deleting a role positioned at or above the requester highest role', async () => {
                authed({
                    permissions: combineBits(KICK_MEMBERS, MANAGE_ROLES),
                    roleIds: [MY_ROLE_ID],
                })
                mockGetFullGuildRoles.mockResolvedValue([
                    roleFixture({ position: 9 }),
                    { id: MY_ROLE_ID, position: 5 },
                ])

                const res = await request(app)
                    .delete(`/api/guilds/${GUILD_ID}/roles/manage/${ROLE_ID}`)
                    .set('Cookie', ['sessionId=valid_session_id'])

                expect(res.status).toBe(403)
                expect(mockDeleteGuildRole).not.toHaveBeenCalled()
            })

            test('allows deleting a role below the requester highest role', async () => {
                authed({
                    permissions: combineBits(KICK_MEMBERS, MANAGE_ROLES),
                    roleIds: [MY_ROLE_ID],
                })
                mockGetFullGuildRoles.mockResolvedValue([
                    roleFixture({ position: 1 }),
                    { id: MY_ROLE_ID, position: 5 },
                ])
                mockDeleteGuildRole.mockResolvedValue(undefined)

                const res = await request(app)
                    .delete(`/api/guilds/${GUILD_ID}/roles/manage/${ROLE_ID}`)
                    .set('Cookie', ['sessionId=valid_session_id'])

                expect(res.status).toBe(200)
                expect(mockDeleteGuildRole).toHaveBeenCalledWith(
                    GUILD_ID,
                    ROLE_ID,
                )
            })

            test('a non-owner Administrator is still blocked by role hierarchy', async () => {
                // Real Discord behavior: Administrator does not bypass the
                // role-position rule, only the guild owner does (#2451
                // review).
                authed({
                    permissions: ADMINISTRATOR,
                    roleIds: [MY_ROLE_ID],
                    botPresenceChecked: true,
                })
                mockGetFullGuildRoles.mockResolvedValue([
                    roleFixture({ position: 9 }),
                    { id: MY_ROLE_ID, position: 5 },
                ])

                const res = await request(app)
                    .delete(`/api/guilds/${GUILD_ID}/roles/manage/${ROLE_ID}`)
                    .set('Cookie', ['sessionId=valid_session_id'])

                expect(res.status).toBe(403)
                expect(mockDeleteGuildRole).not.toHaveBeenCalled()
            })

            test('fails closed when the role list cannot be resolved', async () => {
                authed({
                    permissions: combineBits(KICK_MEMBERS, MANAGE_ROLES),
                    roleIds: [MY_ROLE_ID],
                })
                mockGetFullGuildRoles.mockResolvedValue([])

                const res = await request(app)
                    .delete(`/api/guilds/${GUILD_ID}/roles/manage/${ROLE_ID}`)
                    .set('Cookie', ['sessionId=valid_session_id'])

                expect(res.status).toBe(403)
                expect(mockDeleteGuildRole).not.toHaveBeenCalled()
            })

            test('rejects a MANAGE_GUILD-only admin lacking MANAGE_ROLES', async () => {
                authed({
                    permissions: MANAGE_GUILD,
                    roleIds: [],
                    botPresenceChecked: false,
                })

                const res = await request(app)
                    .delete(`/api/guilds/${GUILD_ID}/roles/manage/${ROLE_ID}`)
                    .set('Cookie', ['sessionId=valid_session_id'])

                expect(res.status).toBe(403)
                expect(mockDeleteGuildRole).not.toHaveBeenCalled()
            })

            test('a MANAGE_ROLES holder whose real roles were never preloaded is still hierarchy-checked', async () => {
                authed({
                    permissions: combineBits(MANAGE_GUILD, MANAGE_ROLES),
                    roleIds: [],
                    botPresenceChecked: false,
                })
                mockGetGuildMemberContext.mockResolvedValue({
                    nickname: null,
                    roleIds: [MY_ROLE_ID],
                })
                mockGetFullGuildRoles.mockResolvedValue([
                    roleFixture({ position: 9 }),
                    { id: MY_ROLE_ID, position: 5 },
                ])

                const res = await request(app)
                    .delete(`/api/guilds/${GUILD_ID}/roles/manage/${ROLE_ID}`)
                    .set('Cookie', ['sessionId=valid_session_id'])

                expect(res.status).toBe(403)
                expect(mockDeleteGuildRole).not.toHaveBeenCalled()
            })

            test('fails closed (403) when the on-demand member fetch cannot confirm bot presence', async () => {
                authed({
                    permissions: combineBits(MANAGE_GUILD, MANAGE_ROLES),
                    roleIds: [],
                    botPresenceChecked: false,
                })
                mockHasBotInGuild.mockResolvedValue(false)
                mockGetFullGuildRoles.mockResolvedValue([
                    roleFixture({ position: 1 }),
                ])

                const res = await request(app)
                    .delete(`/api/guilds/${GUILD_ID}/roles/manage/${ROLE_ID}`)
                    .set('Cookie', ['sessionId=valid_session_id'])

                expect(res.status).toBe(403)
                expect(mockDeleteGuildRole).not.toHaveBeenCalled()
            })

            test('allows the guild owner to delete a role above every other member', async () => {
                authed({ owner: true, permissions: '0', roleIds: [] })
                mockGetFullGuildRoles.mockResolvedValue([
                    roleFixture({ position: 50 }),
                ])
                mockDeleteGuildRole.mockResolvedValue(undefined)

                const res = await request(app)
                    .delete(`/api/guilds/${GUILD_ID}/roles/manage/${ROLE_ID}`)
                    .set('Cookie', ['sessionId=valid_session_id'])

                expect(res.status).toBe(200)
            })
        })

        describe('POST /api/guilds/:guildId/roles/manage/bulk-delete', () => {
            const OTHER_ROLE_ID = '888888888888888888'

            test('rejects the whole batch when one role is positioned at or above the requester highest role', async () => {
                authed({
                    permissions: combineBits(KICK_MEMBERS, MANAGE_ROLES),
                    roleIds: [MY_ROLE_ID],
                })
                mockGetFullGuildRoles.mockResolvedValue([
                    roleFixture({ id: ROLE_ID, position: 1 }),
                    roleFixture({ id: OTHER_ROLE_ID, position: 9 }),
                    { id: MY_ROLE_ID, position: 5 },
                ])

                const res = await request(app)
                    .post(`/api/guilds/${GUILD_ID}/roles/manage/bulk-delete`)
                    .set('Cookie', ['sessionId=valid_session_id'])
                    .send({ roleIds: [ROLE_ID, OTHER_ROLE_ID] })

                expect(res.status).toBe(403)
                expect(mockDeleteGuildRole).not.toHaveBeenCalled()
            })

            test('allows a batch entirely below the requester highest role', async () => {
                authed({
                    permissions: combineBits(KICK_MEMBERS, MANAGE_ROLES),
                    roleIds: [MY_ROLE_ID],
                })
                mockGetFullGuildRoles.mockResolvedValue([
                    roleFixture({ id: ROLE_ID, position: 1 }),
                    roleFixture({ id: OTHER_ROLE_ID, position: 2 }),
                    { id: MY_ROLE_ID, position: 5 },
                ])
                mockDeleteGuildRole.mockResolvedValue(undefined)

                const res = await request(app)
                    .post(`/api/guilds/${GUILD_ID}/roles/manage/bulk-delete`)
                    .set('Cookie', ['sessionId=valid_session_id'])
                    .send({ roleIds: [ROLE_ID, OTHER_ROLE_ID] })

                expect(res.status).toBe(200)
                expect(mockDeleteGuildRole).toHaveBeenCalledTimes(2)
            })

            test('rejects a MANAGE_GUILD-only admin lacking MANAGE_ROLES', async () => {
                authed({
                    permissions: MANAGE_GUILD,
                    roleIds: [],
                    botPresenceChecked: false,
                })

                const res = await request(app)
                    .post(`/api/guilds/${GUILD_ID}/roles/manage/bulk-delete`)
                    .set('Cookie', ['sessionId=valid_session_id'])
                    .send({ roleIds: [ROLE_ID] })

                expect(res.status).toBe(403)
                expect(mockDeleteGuildRole).not.toHaveBeenCalled()
            })

            test('a MANAGE_ROLES holder whose real roles were never preloaded is still hierarchy-checked', async () => {
                authed({
                    permissions: combineBits(MANAGE_GUILD, MANAGE_ROLES),
                    roleIds: [],
                    botPresenceChecked: false,
                })
                mockGetGuildMemberContext.mockResolvedValue({
                    nickname: null,
                    roleIds: [MY_ROLE_ID],
                })
                mockGetFullGuildRoles.mockResolvedValue([
                    roleFixture({ id: ROLE_ID, position: 9 }),
                    { id: MY_ROLE_ID, position: 5 },
                ])

                const res = await request(app)
                    .post(`/api/guilds/${GUILD_ID}/roles/manage/bulk-delete`)
                    .set('Cookie', ['sessionId=valid_session_id'])
                    .send({ roleIds: [ROLE_ID] })

                expect(res.status).toBe(403)
                expect(mockDeleteGuildRole).not.toHaveBeenCalled()
            })

            test('allows the guild owner to bulk-delete roles above every other member', async () => {
                authed({ owner: true, permissions: '0', roleIds: [] })
                mockGetFullGuildRoles.mockResolvedValue([
                    roleFixture({ id: ROLE_ID, position: 50 }),
                ])
                mockDeleteGuildRole.mockResolvedValue(undefined)

                const res = await request(app)
                    .post(`/api/guilds/${GUILD_ID}/roles/manage/bulk-delete`)
                    .set('Cookie', ['sessionId=valid_session_id'])
                    .send({ roleIds: [ROLE_ID] })

                expect(res.status).toBe(200)
                expect(mockDeleteGuildRole).toHaveBeenCalledTimes(1)
            })
        })

        describe('POST /api/guilds/:guildId/roles/manage/:roleId/duplicate', () => {
            test('rejects duplicating a role whose permissions the requester does not hold', async () => {
                authed({ permissions: combineBits(KICK_MEMBERS, MANAGE_ROLES) })
                mockGetFullGuildRoles.mockResolvedValue([
                    roleFixture({ permissions: ADMINISTRATOR }),
                ])

                const res = await request(app)
                    .post(
                        `/api/guilds/${GUILD_ID}/roles/manage/${ROLE_ID}/duplicate`,
                    )
                    .set('Cookie', ['sessionId=valid_session_id'])

                expect(res.status).toBe(403)
                expect(mockCreateGuildRole).not.toHaveBeenCalled()
            })

            test('allows duplicating a role whose permissions the requester already holds', async () => {
                authed({ permissions: combineBits(KICK_MEMBERS, MANAGE_ROLES) })
                mockGetFullGuildRoles.mockResolvedValue([
                    roleFixture({ permissions: KICK_MEMBERS }),
                ])
                mockCreateGuildRole.mockResolvedValue(
                    roleFixture({ permissions: KICK_MEMBERS }),
                )

                const res = await request(app)
                    .post(
                        `/api/guilds/${GUILD_ID}/roles/manage/${ROLE_ID}/duplicate`,
                    )
                    .set('Cookie', ['sessionId=valid_session_id'])

                expect(res.status).toBe(201)
                expect(mockCreateGuildRole).toHaveBeenCalled()
            })

            test('rejects a MANAGE_GUILD-only admin lacking MANAGE_ROLES', async () => {
                authed({
                    permissions: MANAGE_GUILD,
                    roleIds: [],
                    botPresenceChecked: false,
                })
                mockGetFullGuildRoles.mockResolvedValue([
                    roleFixture({ permissions: KICK_MEMBERS }),
                ])

                const res = await request(app)
                    .post(
                        `/api/guilds/${GUILD_ID}/roles/manage/${ROLE_ID}/duplicate`,
                    )
                    .set('Cookie', ['sessionId=valid_session_id'])

                expect(res.status).toBe(403)
                expect(mockCreateGuildRole).not.toHaveBeenCalled()
            })

            test('allows the guild owner to duplicate an Administrator role', async () => {
                authed({ owner: true, permissions: '0' })
                mockGetFullGuildRoles.mockResolvedValue([
                    roleFixture({ permissions: ADMINISTRATOR }),
                ])
                mockCreateGuildRole.mockResolvedValue(
                    roleFixture({ permissions: ADMINISTRATOR }),
                )

                const res = await request(app)
                    .post(
                        `/api/guilds/${GUILD_ID}/roles/manage/${ROLE_ID}/duplicate`,
                    )
                    .set('Cookie', ['sessionId=valid_session_id'])

                expect(res.status).toBe(201)
            })
        })
    })
})
