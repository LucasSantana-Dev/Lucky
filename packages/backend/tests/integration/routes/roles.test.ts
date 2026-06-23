import { errorHandler } from '../../../src/middleware/errorHandler'
import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupRolesRoutes } from '../../../src/routes/roles'
import { setupSessionMiddleware } from '../../../src/middleware/session'
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

describe('Roles Routes', () => {
    let app: express.Express

    beforeEach(() => {
        app = express()
        app.use(express.json())
        setupSessionMiddleware(app)
        setupRolesRoutes(app)
        app.use(errorHandler)
        jest.clearAllMocks()
        process.env.DISCORD_TOKEN = 'test-token-default'
    })

    const GUILD_ID = '111111111111111111'

    function authed() {
        const sessionMock = sessionService as jest.Mocked<typeof sessionService>
        sessionMock.getSession.mockResolvedValue(MOCK_SESSION_DATA)

        const accessMock = guildAccessService as jest.Mocked<
            typeof guildAccessService
        >
        accessMock.resolveGuildContext.mockResolvedValue({
            guildId: GUILD_ID,
            userId: MOCK_SESSION_DATA.userId,
            roles: [],
            permissions: new Set(),
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
        const CHANNEL_ID = '222222222222222222'
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
})
