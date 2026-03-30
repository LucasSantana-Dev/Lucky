import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import type { ChatInputCommandInteraction, GuildChannel } from 'discord.js'
import {
    handleAutoMessageConfig,
    handleAutoMessageList,
} from './automessageHandlers.js'

const getWelcomeMessageMock = jest.fn()
const getLeaveMessageMock = jest.fn()
const getMessagesByTypeMock = jest.fn()
const createMessageMock = jest.fn()
const updateMessageMock = jest.fn()
const infoLogMock = jest.fn()
const interactionReplyMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    autoMessageService: {
        getWelcomeMessage: (...args: unknown[]) =>
            getWelcomeMessageMock(...args),
        getLeaveMessage: (...args: unknown[]) => getLeaveMessageMock(...args),
        getMessagesByType: (...args: unknown[]) =>
            getMessagesByTypeMock(...args),
        createMessage: (...args: unknown[]) => createMessageMock(...args),
        updateMessage: (...args: unknown[]) => updateMessageMock(...args),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    infoLog: (...args: unknown[]) => infoLogMock(...args),
}))

jest.mock('../../../utils/general/interactionReply.js', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

function createChannel(id: string): GuildChannel {
    return {
        id,
        toString: () => `<#${id}>`,
    } as unknown as GuildChannel
}

function createInteraction(
    options: {
        enabled?: boolean
        channel?: GuildChannel | null
        message?: string | null
    } = {},
): ChatInputCommandInteraction {
    return {
        guild: { id: 'guild-123', name: 'Test Guild' },
        user: { tag: 'TestUser#1234' },
        options: {
            getBoolean: jest.fn().mockReturnValue(options.enabled ?? true),
            getChannel: jest.fn().mockReturnValue(options.channel ?? null),
            getString: jest.fn().mockReturnValue(options.message ?? null),
        },
    } as unknown as ChatInputCommandInteraction
}

function createExistingMessage(overrides = {}) {
    return {
        id: 'msg-123',
        guildId: 'guild-123',
        type: 'welcome',
        enabled: true,
        channelId: 'channel-456',
        message: 'Welcome {user} to {server}!',
        ...overrides,
    }
}

describe('handleAutoMessageConfig', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        interactionReplyMock.mockResolvedValue(undefined)
        getWelcomeMessageMock.mockResolvedValue(null)
        getLeaveMessageMock.mockResolvedValue(null)
        createMessageMock.mockResolvedValue(undefined)
        updateMessageMock.mockResolvedValue(undefined)
    })

    it('rejects enabling without channel and message when no existing config', async () => {
        const interaction = createInteraction({ enabled: true })

        await handleAutoMessageConfig(interaction, 'welcome')

        expect(getWelcomeMessageMock).toHaveBeenCalledWith('guild-123')
        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                content:
                    '❌ Please provide a channel and message to enable this feature.',
            },
        })
        expect(createMessageMock).not.toHaveBeenCalled()
        expect(updateMessageMock).not.toHaveBeenCalled()
    })

    it('creates new welcome message when enabled with both channel and message', async () => {
        const channel = createChannel('channel-789')
        const interaction = createInteraction({
            enabled: true,
            channel,
            message: 'Hello {user}!',
        })

        await handleAutoMessageConfig(interaction, 'welcome')

        expect(createMessageMock).toHaveBeenCalledWith(
            'guild-123',
            'welcome',
            { message: 'Hello {user}!' },
            { channelId: 'channel-789' },
        )
        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                embeds: [
                    expect.objectContaining({
                        data: expect.objectContaining({
                            color: 0x51cf66,
                            title: '✅ Welcome Messages Enabled',
                        }),
                    }),
                ],
            },
        })
        expect(infoLogMock).toHaveBeenCalledWith({
            message: 'welcome messages enabled by TestUser#1234 in Test Guild',
        })
    })

    it('creates new leave message when enabled with both channel and message', async () => {
        const channel = createChannel('channel-999')
        const interaction = createInteraction({
            enabled: true,
            channel,
            message: 'Goodbye {user}!',
        })

        await handleAutoMessageConfig(interaction, 'leave')

        expect(createMessageMock).toHaveBeenCalledWith(
            'guild-123',
            'leave',
            { message: 'Goodbye {user}!' },
            { channelId: 'channel-999' },
        )
        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                embeds: [
                    expect.objectContaining({
                        data: expect.objectContaining({
                            color: 0x51cf66,
                            title: '✅ Leave Messages Enabled',
                        }),
                    }),
                ],
            },
        })
    })

    it('updates existing message when enabled with both channel and message', async () => {
        const existing = createExistingMessage()
        getWelcomeMessageMock.mockResolvedValue(existing)
        const channel = createChannel('channel-new')
        const interaction = createInteraction({
            enabled: true,
            channel,
            message: 'Updated message',
        })

        await handleAutoMessageConfig(interaction, 'welcome')

        expect(updateMessageMock).toHaveBeenCalledWith('msg-123', {
            enabled: true,
            message: 'Updated message',
            channelId: 'channel-new',
        })
        expect(createMessageMock).not.toHaveBeenCalled()
    })

    it('updates existing message with only channel when message not provided', async () => {
        const existing = createExistingMessage()
        getWelcomeMessageMock.mockResolvedValue(existing)
        const channel = createChannel('channel-updated')
        const interaction = createInteraction({
            enabled: true,
            channel,
            message: null,
        })

        await handleAutoMessageConfig(interaction, 'welcome')

        expect(updateMessageMock).toHaveBeenCalledWith('msg-123', {
            enabled: true,
            channelId: 'channel-updated',
        })
    })

    it('updates existing message with only message when channel not provided', async () => {
        const existing = createExistingMessage()
        getLeaveMessageMock.mockResolvedValue(existing)
        const interaction = createInteraction({
            enabled: true,
            channel: null,
            message: 'Updated text',
        })

        await handleAutoMessageConfig(interaction, 'leave')

        expect(updateMessageMock).toHaveBeenCalledWith('msg-123', {
            enabled: true,
            message: 'Updated text',
        })
    })

    it('rejects partial update when no existing config', async () => {
        const channel = createChannel('channel-123')
        const interaction = createInteraction({
            enabled: true,
            channel,
            message: null,
        })

        await handleAutoMessageConfig(interaction, 'welcome')

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                content:
                    '❌ Please provide both channel and message for the first setup.',
            },
        })
        expect(createMessageMock).not.toHaveBeenCalled()
        expect(updateMessageMock).not.toHaveBeenCalled()
    })

    it('disables existing welcome message', async () => {
        const existing = createExistingMessage()
        getWelcomeMessageMock.mockResolvedValue(existing)
        const interaction = createInteraction({ enabled: false })

        await handleAutoMessageConfig(interaction, 'welcome')

        expect(updateMessageMock).toHaveBeenCalledWith('msg-123', {
            enabled: false,
        })
        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                embeds: [
                    expect.objectContaining({
                        data: expect.objectContaining({
                            color: 0xc92a2a,
                            title: '❌ Welcome Messages Disabled',
                        }),
                    }),
                ],
            },
        })
        expect(infoLogMock).toHaveBeenCalledWith({
            message: 'welcome messages disabled by TestUser#1234 in Test Guild',
        })
    })

    it('disables existing leave message', async () => {
        const existing = createExistingMessage({ type: 'leave' })
        getLeaveMessageMock.mockResolvedValue(existing)
        const interaction = createInteraction({ enabled: false })

        await handleAutoMessageConfig(interaction, 'leave')

        expect(updateMessageMock).toHaveBeenCalledWith('msg-123', {
            enabled: false,
        })
        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                embeds: [
                    expect.objectContaining({
                        data: expect.objectContaining({
                            color: 0xc92a2a,
                            title: '❌ Leave Messages Disabled',
                        }),
                    }),
                ],
            },
        })
    })

    it('does nothing when disabling non-existent message', async () => {
        const interaction = createInteraction({ enabled: false })

        await handleAutoMessageConfig(interaction, 'welcome')

        expect(updateMessageMock).not.toHaveBeenCalled()
        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                embeds: [
                    expect.objectContaining({
                        data: expect.objectContaining({
                            color: 0xc92a2a,
                            title: '❌ Welcome Messages Disabled',
                        }),
                    }),
                ],
            },
        })
    })

    it('truncates long messages in embed preview', async () => {
        const channel = createChannel('channel-123')
        const longMessage = 'x'.repeat(150)
        const interaction = createInteraction({
            enabled: true,
            channel,
            message: longMessage,
        })

        await handleAutoMessageConfig(interaction, 'welcome')

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                embeds: [
                    expect.objectContaining({
                        data: expect.objectContaining({
                            fields: expect.arrayContaining([
                                expect.objectContaining({
                                    name: 'Message',
                                    value: 'x'.repeat(97) + '...',
                                }),
                            ]),
                        }),
                    }),
                ],
            },
        })
    })

    it('shows full message in embed when under 100 chars', async () => {
        const channel = createChannel('channel-123')
        const shortMessage = 'Welcome {user}!'
        const interaction = createInteraction({
            enabled: true,
            channel,
            message: shortMessage,
        })

        await handleAutoMessageConfig(interaction, 'welcome')

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                embeds: [
                    expect.objectContaining({
                        data: expect.objectContaining({
                            fields: expect.arrayContaining([
                                expect.objectContaining({
                                    name: 'Message',
                                    value: shortMessage,
                                }),
                            ]),
                        }),
                    }),
                ],
            },
        })
    })

    it('enables existing message without changing channel or message', async () => {
        const existing = createExistingMessage({ enabled: false })
        getWelcomeMessageMock.mockResolvedValue(existing)
        const interaction = createInteraction({ enabled: true })

        await handleAutoMessageConfig(interaction, 'welcome')

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                embeds: [
                    expect.objectContaining({
                        data: expect.objectContaining({
                            color: 0x51cf66,
                            title: '✅ Welcome Messages Enabled',
                        }),
                    }),
                ],
            },
        })
    })
})

describe('handleAutoMessageList', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        interactionReplyMock.mockResolvedValue(undefined)
        getMessagesByTypeMock.mockResolvedValue([])
    })

    it('displays empty state when no auto-messages configured', async () => {
        const interaction = createInteraction()

        await handleAutoMessageList(interaction)

        expect(getMessagesByTypeMock).toHaveBeenCalledWith(
            'guild-123',
            'welcome',
        )
        expect(getMessagesByTypeMock).toHaveBeenCalledWith('guild-123', 'leave')
        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: { content: '📋 No auto-messages configured.' },
        })
    })

    it('displays single welcome message', async () => {
        getMessagesByTypeMock.mockImplementation((guildId, type) => {
            if (type === 'welcome') {
                return Promise.resolve([
                    {
                        enabled: true,
                        type: 'welcome',
                        channelId: 'channel-123',
                        message: 'Welcome {user}!',
                    },
                ])
            }
            return Promise.resolve([])
        })
        const interaction = createInteraction()

        await handleAutoMessageList(interaction)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                embeds: [
                    expect.objectContaining({
                        data: expect.objectContaining({
                            color: 0x5865f2,
                            title: '📋 Auto-Messages',
                            description:
                                expect.stringContaining('✅ **WELCOME**'),
                        }),
                    }),
                ],
            },
        })
    })

    it('displays multiple auto-messages with correct formatting', async () => {
        getMessagesByTypeMock.mockImplementation((guildId, type) => {
            if (type === 'welcome') {
                return Promise.resolve([
                    {
                        enabled: true,
                        type: 'welcome',
                        channelId: 'channel-123',
                        message: 'Welcome to {server}!',
                    },
                ])
            }
            return Promise.resolve([
                {
                    enabled: false,
                    type: 'leave',
                    channelId: 'channel-456',
                    message: 'Goodbye {user}!',
                },
            ])
        })
        const interaction = createInteraction()

        await handleAutoMessageList(interaction)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                embeds: [
                    expect.objectContaining({
                        data: expect.objectContaining({
                            description:
                                expect.stringContaining('✅ **WELCOME**'),
                            footer: expect.objectContaining({
                                text: 'Total: 2 auto-messages',
                            }),
                        }),
                    }),
                ],
            },
        })
    })

    it('truncates long messages in list preview', async () => {
        const longMessage = 'x'.repeat(100)
        getMessagesByTypeMock.mockImplementation((guildId, type) => {
            if (type === 'welcome') {
                return Promise.resolve([
                    {
                        enabled: true,
                        type: 'welcome',
                        channelId: 'channel-123',
                        message: longMessage,
                    },
                ])
            }
            return Promise.resolve([])
        })
        const interaction = createInteraction()

        await handleAutoMessageList(interaction)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                embeds: [
                    expect.objectContaining({
                        data: expect.objectContaining({
                            description: expect.stringContaining(
                                longMessage.substring(0, 50) + '...',
                            ),
                        }),
                    }),
                ],
            },
        })
    })

    it('displays messages with missing channel as "Not set"', async () => {
        getMessagesByTypeMock.mockImplementation((guildId, type) => {
            if (type === 'welcome') {
                return Promise.resolve([
                    {
                        enabled: true,
                        type: 'welcome',
                        channelId: null,
                        message: 'Welcome!',
                    },
                ])
            }
            return Promise.resolve([])
        })
        const interaction = createInteraction()

        await handleAutoMessageList(interaction)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                embeds: [
                    expect.objectContaining({
                        data: expect.objectContaining({
                            description:
                                expect.stringContaining('Channel: Not set'),
                        }),
                    }),
                ],
            },
        })
    })

    it('displays messages with missing message text as "No message"', async () => {
        getMessagesByTypeMock.mockImplementation((guildId, type) => {
            if (type === 'leave') {
                return Promise.resolve([
                    {
                        enabled: false,
                        type: 'leave',
                        channelId: 'channel-789',
                        message: null,
                    },
                ])
            }
            return Promise.resolve([])
        })
        const interaction = createInteraction()

        await handleAutoMessageList(interaction)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                embeds: [
                    expect.objectContaining({
                        data: expect.objectContaining({
                            description: expect.stringContaining(
                                'Message: No message',
                            ),
                        }),
                    }),
                ],
            },
        })
    })

    it('formats channel ID as mention in list', async () => {
        getMessagesByTypeMock.mockImplementation((guildId, type) => {
            if (type === 'welcome') {
                return Promise.resolve([
                    {
                        enabled: true,
                        type: 'welcome',
                        channelId: 'channel-999',
                        message: 'Hi!',
                    },
                ])
            }
            return Promise.resolve([])
        })
        const interaction = createInteraction()

        await handleAutoMessageList(interaction)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                embeds: [
                    expect.objectContaining({
                        data: expect.objectContaining({
                            description:
                                expect.stringContaining('<#channel-999>'),
                        }),
                    }),
                ],
            },
        })
    })
})
