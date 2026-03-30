import { jest } from '@jest/globals'
import { Events, AuditLogEvent, ChannelType } from 'discord.js'
import type {
    Client,
    Message,
    PartialMessage,
    GuildChannel,
    Role,
    Guild,
    GuildAuditLogsEntry,
} from 'discord.js'
import { handleAuditEvents } from './auditHandler'

// Mock dependencies
jest.mock('@lucky/shared/services', () => ({
    serverLogService: {
        createLog: jest.fn().mockResolvedValue(undefined),
    },
    featureToggleService: {
        isEnabled: jest.fn().mockResolvedValue(true),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
}))

import { serverLogService } from '@lucky/shared/services'
import { featureToggleService } from '@lucky/shared/services'
import { errorLog, debugLog } from '@lucky/shared/utils'

// Create mock client
function createMockClient(): Client & {
    eventHandlers: Map<string, Function[]>
} {
    const eventHandlers = new Map<string, Function[]>()

    const client = {
        on: jest.fn((event: string, handler: Function) => {
            if (!eventHandlers.has(event)) {
                eventHandlers.set(event, [])
            }
            eventHandlers.get(event)?.push(handler)
            return client
        }),
        eventHandlers,
    } as any

    return client
}

// Helper to trigger events
async function triggerEvent(
    client: ReturnType<typeof createMockClient>,
    event: string,
    ...args: any[]
): Promise<void> {
    const handlers = client.eventHandlers.get(event) || []
    for (const handler of handlers) {
        await handler(...args)
    }
}

describe('auditHandler', () => {
    let client: ReturnType<typeof createMockClient>

    beforeEach(() => {
        jest.clearAllMocks()
        client = createMockClient()
        ;(featureToggleService.isEnabled as jest.Mock).mockResolvedValue(true)
    })

    describe('handleAuditEvents', () => {
        it('should register all event handlers', () => {
            handleAuditEvents(client as any)

            expect(client.on).toHaveBeenCalledWith(
                Events.MessageDelete,
                expect.any(Function),
            )
            expect(client.on).toHaveBeenCalledWith(
                Events.MessageUpdate,
                expect.any(Function),
            )
            expect(client.on).toHaveBeenCalledWith(
                Events.GuildBanAdd,
                expect.any(Function),
            )
            expect(client.on).toHaveBeenCalledWith(
                Events.GuildBanRemove,
                expect.any(Function),
            )
            expect(client.on).toHaveBeenCalledWith(
                Events.ChannelCreate,
                expect.any(Function),
            )
            expect(client.on).toHaveBeenCalledWith(
                Events.ChannelDelete,
                expect.any(Function),
            )
            expect(client.on).toHaveBeenCalledWith(
                Events.GuildRoleCreate,
                expect.any(Function),
            )
            expect(client.on).toHaveBeenCalledWith(
                Events.GuildRoleDelete,
                expect.any(Function),
            )
        })
    })

    describe('MessageDelete event', () => {
        it('should log message delete when feature is enabled', async () => {
            handleAuditEvents(client as any)

            const message = {
                guild: { id: 'guild-1', name: 'Test Guild' },
                author: { bot: false, id: 'user-1', tag: 'User#0001' },
                content: 'Test message',
                channelId: 'channel-1',
            } as unknown as Message

            await triggerEvent(client, Events.MessageDelete, message)

            expect(featureToggleService.isEnabled).toHaveBeenCalledWith(
                'SERVER_LOGS',
                { guildId: 'guild-1' },
            )
            expect(serverLogService.createLog).toHaveBeenCalledWith(
                'guild-1',
                'message_delete',
                'Message deleted',
                {
                    content: 'Test message',
                    authorId: 'user-1',
                    authorTag: 'User#0001',
                },
                {
                    userId: 'user-1',
                    channelId: 'channel-1',
                },
            )
            expect(debugLog).toHaveBeenCalledWith({
                message: 'Logged message delete in Test Guild',
            })
        })

        it('should not log when guild is missing', async () => {
            handleAuditEvents(client as any)

            const message = {
                guild: null,
                author: { bot: false },
            } as unknown as Message

            await triggerEvent(client, Events.MessageDelete, message)

            expect(serverLogService.createLog).not.toHaveBeenCalled()
        })

        it('should not log when author is a bot', async () => {
            handleAuditEvents(client as any)

            const message = {
                guild: { id: 'guild-1' },
                author: { bot: true },
            } as unknown as Message

            await triggerEvent(client, Events.MessageDelete, message)

            expect(serverLogService.createLog).not.toHaveBeenCalled()
        })

        it('should not log when feature is disabled', async () => {
            ;(featureToggleService.isEnabled as jest.Mock).mockResolvedValue(
                false,
            )
            handleAuditEvents(client as any)

            const message = {
                guild: { id: 'guild-1' },
                author: { bot: false, id: 'user-1', tag: 'User#0001' },
                content: 'Test message',
                channelId: 'channel-1',
            } as unknown as Message

            await triggerEvent(client, Events.MessageDelete, message)

            expect(serverLogService.createLog).not.toHaveBeenCalled()
        })

        it('should handle long message content by truncating', async () => {
            handleAuditEvents(client as any)

            const longContent = 'a'.repeat(600)
            const message = {
                guild: { id: 'guild-1', name: 'Test Guild' },
                author: { bot: false, id: 'user-1', tag: 'User#0001' },
                content: longContent,
                channelId: 'channel-1',
            } as unknown as Message

            await triggerEvent(client, Events.MessageDelete, message)

            expect(serverLogService.createLog).toHaveBeenCalledWith(
                'guild-1',
                'message_delete',
                'Message deleted',
                expect.objectContaining({
                    content: 'a'.repeat(500),
                }),
                expect.any(Object),
            )
        })

        it('should handle errors during logging', async () => {
            ;(serverLogService.createLog as jest.Mock).mockRejectedValue(
                new Error('DB error'),
            )
            handleAuditEvents(client as any)

            const message = {
                guild: { id: 'guild-1' },
                author: { bot: false, id: 'user-1', tag: 'User#0001' },
                content: 'Test',
                channelId: 'channel-1',
            } as unknown as Message

            await triggerEvent(client, Events.MessageDelete, message)

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error logging message delete:',
                error: expect.any(Error),
            })
        })
    })

    describe('MessageUpdate event', () => {
        it('should log message edit when content changes', async () => {
            handleAuditEvents(client as any)

            const oldMessage = {
                content: 'Old content',
            } as PartialMessage

            const newMessage = {
                guild: { id: 'guild-1', name: 'Test Guild' },
                author: { bot: false, id: 'user-1', tag: 'User#0001' },
                content: 'New content',
                channelId: 'channel-1',
            } as unknown as Message

            await triggerEvent(
                client,
                Events.MessageUpdate,
                oldMessage,
                newMessage,
            )

            expect(serverLogService.createLog).toHaveBeenCalledWith(
                'guild-1',
                'message_edit',
                'Message edited',
                {
                    oldContent: 'Old content',
                    newContent: 'New content',
                    authorId: 'user-1',
                    authorTag: 'User#0001',
                },
                {
                    userId: 'user-1',
                    channelId: 'channel-1',
                },
            )
        })

        it('should not log when content is unchanged', async () => {
            handleAuditEvents(client as any)

            const oldMessage = {
                content: 'Same content',
            } as PartialMessage

            const newMessage = {
                guild: { id: 'guild-1' },
                author: { bot: false },
                content: 'Same content',
            } as unknown as Message

            await triggerEvent(
                client,
                Events.MessageUpdate,
                oldMessage,
                newMessage,
            )

            expect(serverLogService.createLog).not.toHaveBeenCalled()
        })

        it('should not log when author is a bot', async () => {
            handleAuditEvents(client as any)

            const oldMessage = {
                content: 'Old',
            } as PartialMessage

            const newMessage = {
                guild: { id: 'guild-1' },
                author: { bot: true },
                content: 'New',
            } as unknown as Message

            await triggerEvent(
                client,
                Events.MessageUpdate,
                oldMessage,
                newMessage,
            )

            expect(serverLogService.createLog).not.toHaveBeenCalled()
        })
    })

    describe('GuildBanAdd event', () => {
        it('should log member ban with audit log data', async () => {
            const firstEntry = {
                reason: 'Spam',
                executor: { id: 'mod-1' },
            } as unknown as GuildAuditLogsEntry

            const mockAuditLog = {
                entries: {
                    first: jest.fn().mockReturnValue(firstEntry),
                },
            }

            const ban = {
                user: {
                    id: 'user-1',
                    username: 'TestUser',
                    tag: 'TestUser#0001',
                },
                guild: {
                    id: 'guild-1',
                    name: 'Test Guild',
                    fetchAuditLogs: jest.fn().mockResolvedValue(mockAuditLog),
                },
            } as any

            handleAuditEvents(client as any)
            await triggerEvent(client, Events.GuildBanAdd, ban)

            expect(serverLogService.createLog).toHaveBeenCalledWith(
                'guild-1',
                'mod_action',
                'Member banned',
                {
                    userId: 'user-1',
                    username: 'TestUser',
                    tag: 'TestUser#0001',
                    reason: 'Spam',
                },
                {
                    userId: 'user-1',
                    moderatorId: 'mod-1',
                },
            )
        })

        it('should handle missing audit log gracefully', async () => {
            const ban = {
                user: {
                    id: 'user-1',
                    username: 'TestUser',
                    tag: 'TestUser#0001',
                },
                guild: {
                    id: 'guild-1',
                    name: 'Test Guild',
                    fetchAuditLogs: jest.fn().mockRejectedValue(new Error()),
                },
            } as any

            handleAuditEvents(client as any)
            await triggerEvent(client, Events.GuildBanAdd, ban)

            expect(serverLogService.createLog).toHaveBeenCalledWith(
                'guild-1',
                'mod_action',
                'Member banned',
                expect.objectContaining({
                    reason: 'No reason provided',
                }),
                expect.objectContaining({
                    moderatorId: undefined,
                }),
            )
        })
    })

    describe('GuildBanRemove event', () => {
        it('should log member unban with audit log data', async () => {
            const firstEntry = {
                reason: 'Appeal accepted',
                executor: { id: 'mod-1' },
            } as unknown as GuildAuditLogsEntry

            const mockAuditLog = {
                entries: {
                    first: jest.fn().mockReturnValue(firstEntry),
                },
            }

            const ban = {
                user: {
                    id: 'user-1',
                    username: 'TestUser',
                    tag: 'TestUser#0001',
                },
                guild: {
                    id: 'guild-1',
                    name: 'Test Guild',
                    fetchAuditLogs: jest.fn().mockResolvedValue(mockAuditLog),
                },
            } as any

            handleAuditEvents(client as any)
            await triggerEvent(client, Events.GuildBanRemove, ban)

            expect(serverLogService.createLog).toHaveBeenCalledWith(
                'guild-1',
                'mod_action',
                'Member unbanned',
                {
                    userId: 'user-1',
                    username: 'TestUser',
                    tag: 'TestUser#0001',
                    reason: 'Appeal accepted',
                },
                {
                    userId: 'user-1',
                    moderatorId: 'mod-1',
                },
            )
        })
    })

    describe('ChannelCreate event', () => {
        it('should log channel creation', async () => {
            const firstEntry = {
                executor: { id: 'mod-1' },
            } as unknown as GuildAuditLogsEntry

            const mockAuditLog = {
                entries: {
                    first: jest.fn().mockReturnValue(firstEntry),
                },
            }

            const channel = {
                id: 'channel-1',
                name: 'new-channel',
                type: ChannelType.GuildText,
                guild: {
                    id: 'guild-1',
                    name: 'Test Guild',
                    fetchAuditLogs: jest.fn().mockResolvedValue(mockAuditLog),
                },
            } as unknown as GuildChannel

            handleAuditEvents(client as any)
            await triggerEvent(client, Events.ChannelCreate, channel)

            expect(serverLogService.createLog).toHaveBeenCalledWith(
                'guild-1',
                'channel_update',
                'Channel created',
                {
                    channelId: 'channel-1',
                    channelName: 'new-channel',
                    channelType: ChannelType.GuildText,
                },
                {
                    channelId: 'channel-1',
                    moderatorId: 'mod-1',
                },
            )
        })

        it('should skip non-guild channels', async () => {
            const channel = {
                id: 'dm-1',
                type: ChannelType.DM,
            } as any

            handleAuditEvents(client as any)
            await triggerEvent(client, Events.ChannelCreate, channel)

            expect(serverLogService.createLog).not.toHaveBeenCalled()
        })

        it('should handle audit log errors', async () => {
            const channel = {
                id: 'channel-1',
                name: 'new-channel',
                type: ChannelType.GuildText,
                guild: {
                    id: 'guild-1',
                    name: 'Test Guild',
                    fetchAuditLogs: jest.fn().mockRejectedValue(new Error()),
                },
            } as unknown as GuildChannel

            handleAuditEvents(client as any)
            await triggerEvent(client, Events.ChannelCreate, channel)

            expect(serverLogService.createLog).toHaveBeenCalledWith(
                'guild-1',
                'channel_update',
                'Channel created',
                expect.any(Object),
                expect.objectContaining({
                    moderatorId: undefined,
                }),
            )
        })
    })

    describe('ChannelDelete event', () => {
        it('should log channel deletion', async () => {
            const firstEntry = {
                executor: { id: 'mod-1' },
            } as unknown as GuildAuditLogsEntry

            const mockAuditLog = {
                entries: {
                    first: jest.fn().mockReturnValue(firstEntry),
                },
            }

            const channel = {
                id: 'channel-1',
                name: 'deleted-channel',
                type: ChannelType.GuildVoice,
                guild: {
                    id: 'guild-1',
                    name: 'Test Guild',
                    fetchAuditLogs: jest.fn().mockResolvedValue(mockAuditLog),
                },
            } as unknown as GuildChannel

            handleAuditEvents(client as any)
            await triggerEvent(client, Events.ChannelDelete, channel)

            expect(serverLogService.createLog).toHaveBeenCalledWith(
                'guild-1',
                'channel_update',
                'Channel deleted',
                {
                    channelId: 'channel-1',
                    channelName: 'deleted-channel',
                    channelType: ChannelType.GuildVoice,
                },
                {
                    channelId: 'channel-1',
                    moderatorId: 'mod-1',
                },
            )
        })

        it('should skip non-guild channels', async () => {
            const channel = {
                id: 'dm-1',
            } as any

            handleAuditEvents(client as any)
            await triggerEvent(client, Events.ChannelDelete, channel)

            expect(serverLogService.createLog).not.toHaveBeenCalled()
        })
    })

    describe('Error handling in event wrapper', () => {
        it('should catch and log errors from MessageDelete handler', async () => {
            ;(featureToggleService.isEnabled as jest.Mock).mockRejectedValue(
                new Error('Service error'),
            )

            const message = {
                guild: { id: 'guild-1' },
                author: { bot: false },
            } as unknown as Message

            handleAuditEvents(client as any)
            await triggerEvent(client, Events.MessageDelete, message)

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error in message delete handler:',
                error: expect.any(Error),
            })
        })

        it('should catch and log errors from MessageUpdate handler', async () => {
            ;(featureToggleService.isEnabled as jest.Mock).mockRejectedValue(
                new Error('Service error'),
            )

            const oldMessage = {
                content: 'Old',
            } as PartialMessage

            const newMessage = {
                guild: { id: 'guild-1' },
                author: { bot: false },
                content: 'New',
            } as unknown as Message

            handleAuditEvents(client as any)
            await triggerEvent(
                client,
                Events.MessageUpdate,
                oldMessage,
                newMessage,
            )

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error in message update handler:',
                error: expect.any(Error),
            })
        })

        it('should catch and log errors from GuildBanAdd handler', async () => {
            ;(featureToggleService.isEnabled as jest.Mock).mockRejectedValue(
                new Error('Service error'),
            )

            const ban = {
                user: { id: 'user-1' },
                guild: { id: 'guild-1' },
            } as any

            handleAuditEvents(client as any)
            await triggerEvent(client, Events.GuildBanAdd, ban)

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error in ban add handler:',
                error: expect.any(Error),
            })
        })

        it('should catch and log errors from GuildBanRemove handler', async () => {
            ;(featureToggleService.isEnabled as jest.Mock).mockRejectedValue(
                new Error('Service error'),
            )

            const ban = {
                user: { id: 'user-1' },
                guild: { id: 'guild-1' },
            } as any

            handleAuditEvents(client as any)
            await triggerEvent(client, Events.GuildBanRemove, ban)

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error in ban remove handler:',
                error: expect.any(Error),
            })
        })

        it('should catch and log errors from ChannelCreate handler', async () => {
            const channel = {
                id: 'channel-1',
                guild: { id: 'guild-1' },
            } as any

            ;(featureToggleService.isEnabled as jest.Mock).mockRejectedValue(
                new Error('Service error'),
            )

            handleAuditEvents(client as any)
            await triggerEvent(client, Events.ChannelCreate, channel)

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error in channel create handler:',
                error: expect.any(Error),
            })
        })

        it('should catch and log errors from ChannelDelete handler', async () => {
            const channel = {
                id: 'channel-1',
                guild: { id: 'guild-1' },
            } as any

            ;(featureToggleService.isEnabled as jest.Mock).mockRejectedValue(
                new Error('Service error'),
            )

            handleAuditEvents(client as any)
            await triggerEvent(client, Events.ChannelDelete, channel)

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error in channel delete handler:',
                error: expect.any(Error),
            })
        })

        it('should catch and log errors from GuildRoleCreate handler', async () => {
            const role = {
                id: 'role-1',
                guild: { id: 'guild-1' },
            } as any

            ;(featureToggleService.isEnabled as jest.Mock).mockRejectedValue(
                new Error('Service error'),
            )

            handleAuditEvents(client as any)
            await triggerEvent(client, Events.GuildRoleCreate, role)

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error in role create handler:',
                error: expect.any(Error),
            })
        })

        it('should catch and log errors from GuildRoleDelete handler', async () => {
            const role = {
                id: 'role-1',
                guild: { id: 'guild-1' },
            } as any

            ;(featureToggleService.isEnabled as jest.Mock).mockRejectedValue(
                new Error('Service error'),
            )

            handleAuditEvents(client as any)
            await triggerEvent(client, Events.GuildRoleDelete, role)

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error in role delete handler:',
                error: expect.any(Error),
            })
        })
    })

    describe('GuildRoleCreate event', () => {
        it('should log role creation with audit log data', async () => {
            const firstEntry = {
                executor: { id: 'mod-1' },
            } as unknown as GuildAuditLogsEntry

            const mockAuditLog = {
                entries: {
                    first: jest.fn().mockReturnValue(firstEntry),
                },
            }

            const role = {
                id: 'role-1',
                name: 'Moderator',
                color: 0x00ff00,
                permissions: { bitfield: BigInt(8) },
                guild: {
                    id: 'guild-1',
                    name: 'Test Guild',
                    fetchAuditLogs: jest.fn().mockResolvedValue(mockAuditLog),
                },
            } as unknown as Role

            handleAuditEvents(client as any)
            await triggerEvent(client, Events.GuildRoleCreate, role)

            expect(serverLogService.createLog).toHaveBeenCalledWith(
                'guild-1',
                'role_update',
                'Role created',
                {
                    roleId: 'role-1',
                    roleName: 'Moderator',
                    color: 0x00ff00,
                    permissions: '8',
                },
                {
                    moderatorId: 'mod-1',
                },
            )
            expect(debugLog).toHaveBeenCalledWith({
                message: 'Logged role created in Test Guild',
            })
        })

        it('should not log when feature is disabled', async () => {
            ;(featureToggleService.isEnabled as jest.Mock).mockResolvedValue(
                false,
            )

            const role = {
                id: 'role-1',
                name: 'Test Role',
                guild: {
                    id: 'guild-1',
                },
            } as unknown as Role

            handleAuditEvents(client as any)
            await triggerEvent(client, Events.GuildRoleCreate, role)

            expect(serverLogService.createLog).not.toHaveBeenCalled()
        })

        it('should handle missing audit log gracefully', async () => {
            const role = {
                id: 'role-1',
                name: 'Test Role',
                color: 0xff0000,
                permissions: { bitfield: BigInt(0) },
                guild: {
                    id: 'guild-1',
                    name: 'Test Guild',
                    fetchAuditLogs: jest.fn().mockRejectedValue(new Error()),
                },
            } as unknown as Role

            handleAuditEvents(client as any)
            await triggerEvent(client, Events.GuildRoleCreate, role)

            expect(serverLogService.createLog).toHaveBeenCalledWith(
                'guild-1',
                'role_update',
                'Role created',
                expect.objectContaining({
                    roleId: 'role-1',
                    roleName: 'Test Role',
                }),
                expect.objectContaining({
                    moderatorId: undefined,
                }),
            )
        })

        it('should handle errors during logging', async () => {
            ;(serverLogService.createLog as jest.Mock).mockRejectedValue(
                new Error('DB error'),
            )

            const role = {
                id: 'role-1',
                name: 'Test Role',
                color: 0,
                permissions: { bitfield: BigInt(0) },
                guild: {
                    id: 'guild-1',
                    name: 'Test Guild',
                    fetchAuditLogs: jest.fn().mockResolvedValue({
                        entries: { first: jest.fn().mockReturnValue(null) },
                    }),
                },
            } as unknown as Role

            handleAuditEvents(client as any)
            await triggerEvent(client, Events.GuildRoleCreate, role)

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error logging role created:',
                error: expect.any(Error),
            })
        })
    })

    describe('GuildRoleDelete event', () => {
        it('should log role deletion with audit log data', async () => {
            const firstEntry = {
                executor: { id: 'mod-1' },
            } as unknown as GuildAuditLogsEntry

            const mockAuditLog = {
                entries: {
                    first: jest.fn().mockReturnValue(firstEntry),
                },
            }

            const role = {
                id: 'role-1',
                name: 'Spammer',
                color: 0xff0000,
                permissions: { bitfield: BigInt(0) },
                guild: {
                    id: 'guild-1',
                    name: 'Test Guild',
                    fetchAuditLogs: jest.fn().mockResolvedValue(mockAuditLog),
                },
            } as unknown as Role

            handleAuditEvents(client as any)
            await triggerEvent(client, Events.GuildRoleDelete, role)

            expect(serverLogService.createLog).toHaveBeenCalledWith(
                'guild-1',
                'role_update',
                'Role deleted',
                {
                    roleId: 'role-1',
                    roleName: 'Spammer',
                    color: 0xff0000,
                    permissions: '0',
                },
                {
                    moderatorId: 'mod-1',
                },
            )
            expect(debugLog).toHaveBeenCalledWith({
                message: 'Logged role deleted in Test Guild',
            })
        })

        it('should not log when feature is disabled', async () => {
            ;(featureToggleService.isEnabled as jest.Mock).mockResolvedValue(
                false,
            )

            const role = {
                id: 'role-1',
                name: 'Test Role',
                guild: {
                    id: 'guild-1',
                },
            } as unknown as Role

            handleAuditEvents(client as any)
            await triggerEvent(client, Events.GuildRoleDelete, role)

            expect(serverLogService.createLog).not.toHaveBeenCalled()
        })

        it('should handle missing audit log gracefully', async () => {
            const role = {
                id: 'role-1',
                name: 'Old Role',
                color: 0x0000ff,
                permissions: { bitfield: BigInt(16) },
                guild: {
                    id: 'guild-1',
                    name: 'Test Guild',
                    fetchAuditLogs: jest.fn().mockRejectedValue(new Error()),
                },
            } as unknown as Role

            handleAuditEvents(client as any)
            await triggerEvent(client, Events.GuildRoleDelete, role)

            expect(serverLogService.createLog).toHaveBeenCalledWith(
                'guild-1',
                'role_update',
                'Role deleted',
                expect.objectContaining({
                    roleId: 'role-1',
                    roleName: 'Old Role',
                }),
                expect.objectContaining({
                    moderatorId: undefined,
                }),
            )
        })

        it('should handle errors during logging', async () => {
            ;(serverLogService.createLog as jest.Mock).mockRejectedValue(
                new Error('DB error'),
            )

            const role = {
                id: 'role-1',
                name: 'Test Role',
                color: 0,
                permissions: { bitfield: BigInt(0) },
                guild: {
                    id: 'guild-1',
                    name: 'Test Guild',
                    fetchAuditLogs: jest.fn().mockResolvedValue({
                        entries: { first: jest.fn().mockReturnValue(null) },
                    }),
                },
            } as unknown as Role

            handleAuditEvents(client as any)
            await triggerEvent(client, Events.GuildRoleDelete, role)

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error logging role deleted:',
                error: expect.any(Error),
            })
        })
    })
})
