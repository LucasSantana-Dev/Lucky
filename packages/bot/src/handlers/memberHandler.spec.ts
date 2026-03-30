import { jest } from '@jest/globals'
import { Events, ChannelType } from 'discord.js'
import type { Client, GuildMember, PartialGuildMember } from 'discord.js'
import { handleMemberEvents } from './memberHandler'

// Mock dependencies
jest.mock('@lucky/shared/services', () => ({
    autoMessageService: {
        getWelcomeMessage: jest.fn(),
        getLeaveMessage: jest.fn(),
    },
    featureToggleService: {
        isEnabled: jest.fn().mockResolvedValue(true),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
}))

import { autoMessageService } from '@lucky/shared/services'
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

describe('memberHandler', () => {
    let client: ReturnType<typeof createMockClient>

    beforeEach(() => {
        jest.clearAllMocks()
        ;(featureToggleService.isEnabled as jest.Mock).mockResolvedValue(true)
    })

    describe('handleMemberEvents', () => {
        it('should register event handlers', () => {
            client = createMockClient()
            handleMemberEvents(client as any)

            expect(client.on).toHaveBeenCalledWith(
                Events.GuildMemberAdd,
                expect.any(Function),
            )
            expect(client.on).toHaveBeenCalledWith(
                Events.GuildMemberRemove,
                expect.any(Function),
            )
        })
    })

    describe('GuildMemberAdd event', () => {
        beforeEach(() => {
            client = createMockClient()
        })

        it('should send welcome message in specified channel', async () => {
            const mockSend = jest.fn().mockResolvedValue(undefined)
            const welcomeChannel = {
                type: ChannelType.GuildText,
                send: mockSend,
            }

            const member = {
                guild: {
                    id: 'guild-1',
                    name: 'Test Guild',
                    memberCount: 100,
                    channels: {
                        cache: new Map([['welcome-channel-1', welcomeChannel]]),
                    },
                },
                user: {
                    username: 'TestUser',
                    tag: 'TestUser#0001',
                },
                toString: () => '<@user-1>',
            } as unknown as GuildMember

            ;(
                autoMessageService.getWelcomeMessage as jest.Mock
            ).mockResolvedValue({
                enabled: true,
                channelId: 'welcome-channel-1',
                message: 'Welcome {mention} to {guild}! Member #{count}',
                embedData: null,
            })

            handleMemberEvents(client as any)
            await triggerEvent(client, Events.GuildMemberAdd, member)

            expect(featureToggleService.isEnabled).toHaveBeenCalledWith(
                'WELCOME_MESSAGES',
                { guildId: 'guild-1' },
            )
            expect(autoMessageService.getWelcomeMessage).toHaveBeenCalledWith(
                'guild-1',
            )
            expect(mockSend).toHaveBeenCalledWith(
                'Welcome <@user-1> to Test Guild! Member #100',
            )
            expect(debugLog).toHaveBeenCalledWith({
                message: 'Sent welcome message to TestUser#0001 in Test Guild',
            })
        })

        it('should fallback to system channel when no channel specified', async () => {
            const mockSend = jest.fn().mockResolvedValue(undefined)
            const systemChannel = {
                type: ChannelType.GuildText,
                send: mockSend,
            }

            const member = {
                guild: {
                    id: 'guild-1',
                    name: 'Test Guild',
                    memberCount: 50,
                    systemChannel,
                    channels: {
                        cache: new Map(),
                    },
                },
                user: {
                    username: 'NewUser',
                },
                toString: () => '<@user-2>',
            } as unknown as GuildMember

            ;(
                autoMessageService.getWelcomeMessage as jest.Mock
            ).mockResolvedValue({
                enabled: true,
                channelId: null,
                message: 'Hello {user}!',
                embedData: null,
            })

            handleMemberEvents(client as any)
            await triggerEvent(client, Events.GuildMemberAdd, member)

            expect(mockSend).toHaveBeenCalledWith('Hello NewUser!')
        })

        it('should fallback to first text channel', async () => {
            const mockSend = jest.fn().mockResolvedValue(undefined)
            const firstTextChannel = {
                type: ChannelType.GuildText,
                send: mockSend,
            }

            const cacheMap = new Map([
                ['voice-1', { type: ChannelType.GuildVoice }],
                ['text-1', firstTextChannel],
            ])
            ;(cacheMap as any).find = jest
                .fn()
                .mockReturnValue(firstTextChannel)

            const member = {
                guild: {
                    id: 'guild-1',
                    name: 'Test Guild',
                    memberCount: 10,
                    systemChannel: null,
                    channels: {
                        cache: cacheMap,
                    },
                },
                user: {
                    username: 'User3',
                },
                toString: () => '<@user-3>',
            } as unknown as GuildMember

            ;(
                autoMessageService.getWelcomeMessage as jest.Mock
            ).mockResolvedValue({
                enabled: true,
                channelId: null,
                message: 'Hi!',
                embedData: null,
            })

            handleMemberEvents(client as any)
            await triggerEvent(client, Events.GuildMemberAdd, member)

            expect(mockSend).toHaveBeenCalledWith('Hi!')
        })

        it('should send welcome message with embed', async () => {
            const mockSend = jest.fn().mockResolvedValue(undefined)
            const welcomeChannel = {
                type: ChannelType.GuildText,
                send: mockSend,
            }

            const member = {
                guild: {
                    id: 'guild-1',
                    name: 'Test Guild',
                    memberCount: 200,
                    systemChannel: welcomeChannel,
                    channels: {
                        cache: new Map(),
                    },
                },
                user: {
                    username: 'EmbedUser',
                    tag: 'EmbedUser#0001',
                },
                toString: () => '<@embed-user>',
            } as unknown as GuildMember

            ;(
                autoMessageService.getWelcomeMessage as jest.Mock
            ).mockResolvedValue({
                enabled: true,
                channelId: null,
                message: 'Welcome {mention}!',
                embedData: {
                    title: 'New Member',
                    color: '#5865F2',
                },
            })

            handleMemberEvents(client as any)
            await triggerEvent(client, Events.GuildMemberAdd, member)

            expect(mockSend).toHaveBeenCalled()
            const callArg = mockSend.mock.calls[0][0]
            expect(callArg).toHaveProperty('embeds')
            expect(callArg.embeds).toHaveLength(1)
            expect(callArg.embeds[0].data.title).toBe('New Member')
            expect(callArg.embeds[0].data.description).toBe(
                'Welcome <@embed-user>!',
            )
        })

        it('should fallback to text when embed parsing fails', async () => {
            const mockSend = jest.fn().mockResolvedValue(undefined)
            const channel = {
                type: ChannelType.GuildText,
                send: mockSend,
            }

            const member = {
                guild: {
                    id: 'guild-1',
                    name: 'Test Guild',
                    memberCount: 10,
                    systemChannel: channel,
                    channels: { cache: new Map() },
                },
                user: {
                    username: 'User',
                    tag: 'User#0001',
                },
                toString: () => '<@user>',
            } as unknown as GuildMember

            ;(
                autoMessageService.getWelcomeMessage as jest.Mock
            ).mockResolvedValue({
                enabled: true,
                message: 'Hello {mention}',
                embedData: 'invalid json',
            })

            handleMemberEvents(client as any)
            await triggerEvent(client, Events.GuildMemberAdd, member)

            expect(mockSend).toHaveBeenCalledWith('Hello <@user>')
        })

        it('should not send when guild is missing', async () => {
            const member = {
                guild: null,
            } as unknown as GuildMember

            handleMemberEvents(client as any)
            await triggerEvent(client, Events.GuildMemberAdd, member)

            expect(autoMessageService.getWelcomeMessage).not.toHaveBeenCalled()
        })

        it('should not send when feature is disabled', async () => {
            ;(featureToggleService.isEnabled as jest.Mock).mockResolvedValue(
                false,
            )

            const member = {
                guild: { id: 'guild-1' },
            } as unknown as GuildMember

            handleMemberEvents(client as any)
            await triggerEvent(client, Events.GuildMemberAdd, member)

            expect(autoMessageService.getWelcomeMessage).not.toHaveBeenCalled()
        })

        it('should not send when welcome message is not enabled', async () => {
            ;(
                autoMessageService.getWelcomeMessage as jest.Mock
            ).mockResolvedValue({
                enabled: false,
                message: 'Welcome!',
            })

            const member = {
                guild: {
                    id: 'guild-1',
                    systemChannel: { send: jest.fn() },
                },
            } as unknown as GuildMember

            handleMemberEvents(client as any)
            await triggerEvent(client, Events.GuildMemberAdd, member)

            expect(debugLog).not.toHaveBeenCalled()
        })

        it('should not send when welcome message is null', async () => {
            ;(
                autoMessageService.getWelcomeMessage as jest.Mock
            ).mockResolvedValue(null)

            const member = {
                guild: { id: 'guild-1' },
            } as unknown as GuildMember

            handleMemberEvents(client as any)
            await triggerEvent(client, Events.GuildMemberAdd, member)

            expect(debugLog).not.toHaveBeenCalled()
        })

        it('should not send when no suitable channel found', async () => {
            ;(
                autoMessageService.getWelcomeMessage as jest.Mock
            ).mockResolvedValue({
                enabled: true,
                message: 'Welcome',
                channelId: null,
            })

            const cacheMap = new Map([
                ['voice-1', { type: ChannelType.GuildVoice }],
            ])
            ;(cacheMap as any).find = jest.fn().mockReturnValue(undefined)

            const member = {
                guild: {
                    id: 'guild-1',
                    systemChannel: null,
                    channels: {
                        cache: cacheMap,
                    },
                },
                user: { username: 'User', tag: 'User#0001' },
            } as unknown as GuildMember

            handleMemberEvents(client as any)
            await triggerEvent(client, Events.GuildMemberAdd, member)

            expect(debugLog).toHaveBeenCalledWith({
                message:
                    'No suitable channel found for welcome message in guild-1',
            })
            expect(autoMessageService.getWelcomeMessage).toHaveBeenCalled()
        })

        it('should handle errors gracefully', async () => {
            ;(
                autoMessageService.getWelcomeMessage as jest.Mock
            ).mockRejectedValue(new Error('Service error'))

            const member = {
                guild: { id: 'guild-1', name: 'Test Guild' },
                user: { username: 'User' },
            } as unknown as GuildMember

            handleMemberEvents(client as any)
            await triggerEvent(client, Events.GuildMemberAdd, member)

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error handling member add:',
                error: expect.any(Error),
            })
        })

        it('should handle errors in event wrapper', async () => {
            ;(featureToggleService.isEnabled as jest.Mock).mockRejectedValue(
                new Error('Toggle error'),
            )

            const member = {
                guild: { id: 'guild-1' },
            } as unknown as GuildMember

            handleMemberEvents(client as any)
            await triggerEvent(client, Events.GuildMemberAdd, member)

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error in member add handler:',
                error: expect.any(Error),
            })
        })
    })

    describe('GuildMemberRemove event', () => {
        beforeEach(() => {
            client = createMockClient()
        })

        it('should send leave message in specified channel', async () => {
            const mockSend = jest.fn().mockResolvedValue(undefined)
            const leaveChannel = {
                type: ChannelType.GuildText,
                send: mockSend,
            }

            const member = {
                guild: {
                    id: 'guild-1',
                    name: 'Test Guild',
                    memberCount: 99,
                    channels: {
                        cache: new Map([['leave-channel-1', leaveChannel]]),
                    },
                },
                user: {
                    username: 'LeavingUser',
                    tag: 'LeavingUser#0001',
                },
                toString: () => '<@leaving-user>',
            } as unknown as GuildMember

            ;(
                autoMessageService.getLeaveMessage as jest.Mock
            ).mockResolvedValue({
                enabled: true,
                channelId: 'leave-channel-1',
                message: 'Goodbye {user} from {guild}. Now {count} members.',
                embedData: null,
            })

            handleMemberEvents(client as any)
            await triggerEvent(client, Events.GuildMemberRemove, member)

            expect(featureToggleService.isEnabled).toHaveBeenCalledWith(
                'WELCOME_MESSAGES',
                { guildId: 'guild-1' },
            )
            expect(autoMessageService.getLeaveMessage).toHaveBeenCalledWith(
                'guild-1',
            )
            expect(mockSend).toHaveBeenCalledWith(
                'Goodbye LeavingUser from Test Guild. Now 99 members.',
            )
            expect(debugLog).toHaveBeenCalledWith({
                message:
                    'Sent leave message for LeavingUser#0001 in Test Guild',
            })
        })

        it('should send leave message with embed', async () => {
            const mockSend = jest.fn().mockResolvedValue(undefined)
            const channel = {
                type: ChannelType.GuildText,
                send: mockSend,
            }

            const member = {
                guild: {
                    id: 'guild-1',
                    name: 'Test Guild',
                    memberCount: 50,
                    systemChannel: channel,
                    channels: {
                        cache: new Map(),
                    },
                },
                user: {
                    username: 'User',
                    tag: 'User#0001',
                },
                toString: () => '<@user>',
            } as unknown as PartialGuildMember

            ;(
                autoMessageService.getLeaveMessage as jest.Mock
            ).mockResolvedValue({
                enabled: true,
                message: '{user} left',
                embedData: {
                    title: 'Member Left',
                    color: '#ED4245',
                },
            })

            handleMemberEvents(client as any)
            await triggerEvent(client, Events.GuildMemberRemove, member)

            expect(mockSend).toHaveBeenCalled()
            const callArg = mockSend.mock.calls[0][0]
            expect(callArg).toHaveProperty('embeds')
            expect(callArg.embeds).toHaveLength(1)
            expect(callArg.embeds[0].data.title).toBe('Member Left')
            expect(callArg.embeds[0].data.description).toBe('User left')
        })

        it('should fallback to text when embed parsing fails', async () => {
            const mockSend = jest.fn().mockResolvedValue(undefined)
            const channel = {
                type: ChannelType.GuildText,
                send: mockSend,
            }

            const member = {
                guild: {
                    id: 'guild-1',
                    name: 'Test Guild',
                    memberCount: 10,
                    systemChannel: channel,
                    channels: { cache: new Map() },
                },
                user: {
                    username: 'User',
                    tag: 'User#0001',
                },
                toString: () => '<@user>',
            } as unknown as PartialGuildMember

            ;(
                autoMessageService.getLeaveMessage as jest.Mock
            ).mockResolvedValue({
                enabled: true,
                message: 'Bye {mention}',
                embedData: 'not valid json',
            })

            handleMemberEvents(client as any)
            await triggerEvent(client, Events.GuildMemberRemove, member)

            expect(mockSend).toHaveBeenCalledWith('Bye <@user>')
        })

        it('should not send when guild is missing', async () => {
            const member = {
                guild: null,
            } as unknown as PartialGuildMember

            handleMemberEvents(client as any)
            await triggerEvent(client, Events.GuildMemberRemove, member)

            expect(autoMessageService.getLeaveMessage).not.toHaveBeenCalled()
        })

        it('should not send when feature is disabled', async () => {
            ;(featureToggleService.isEnabled as jest.Mock).mockResolvedValue(
                false,
            )

            const member = {
                guild: { id: 'guild-1' },
            } as unknown as PartialGuildMember

            handleMemberEvents(client as any)
            await triggerEvent(client, Events.GuildMemberRemove, member)

            expect(autoMessageService.getLeaveMessage).not.toHaveBeenCalled()
        })

        it('should not send when leave message is disabled', async () => {
            ;(
                autoMessageService.getLeaveMessage as jest.Mock
            ).mockResolvedValue({
                enabled: false,
                message: 'Bye',
            })

            const member = {
                guild: { id: 'guild-1' },
            } as unknown as PartialGuildMember

            handleMemberEvents(client as any)
            await triggerEvent(client, Events.GuildMemberRemove, member)

            expect(debugLog).not.toHaveBeenCalled()
        })

        it('should not send when no suitable channel found', async () => {
            ;(
                autoMessageService.getLeaveMessage as jest.Mock
            ).mockResolvedValue({
                enabled: true,
                message: 'Bye',
                channelId: null,
            })

            const cacheMap = new Map()
            ;(cacheMap as any).find = jest.fn().mockReturnValue(undefined)

            const member = {
                guild: {
                    id: 'guild-1',
                    systemChannel: null,
                    channels: {
                        cache: cacheMap,
                    },
                },
                user: { username: 'User', tag: 'User#0001' },
            } as unknown as PartialGuildMember

            handleMemberEvents(client as any)
            await triggerEvent(client, Events.GuildMemberRemove, member)

            expect(debugLog).toHaveBeenCalledWith({
                message:
                    'No suitable channel found for leave message in guild-1',
            })
            expect(autoMessageService.getLeaveMessage).toHaveBeenCalled()
        })

        it('should handle errors gracefully', async () => {
            ;(
                autoMessageService.getLeaveMessage as jest.Mock
            ).mockRejectedValue(new Error('Service error'))

            const member = {
                guild: { id: 'guild-1', name: 'Test Guild' },
                user: { username: 'User', tag: 'User#0001' },
            } as unknown as PartialGuildMember

            handleMemberEvents(client as any)
            await triggerEvent(client, Events.GuildMemberRemove, member)

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error handling member remove:',
                error: expect.any(Error),
            })
        })
    })
})
