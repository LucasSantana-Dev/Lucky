import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import purgeCommand from './purge.js'
import { ChannelType } from 'discord.js'

const interactionReplyMock = jest.fn()
const infoLogMock = jest.fn()
const errorLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    infoLog: (...args: unknown[]) => infoLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('../../../utils/general/interactionReply.js', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

function createUser(id = 'user-123', tag = 'TestUser#1234') {
    return {
        id,
        tag,
    } as any
}

function createMessage(
    id = 'msg-123',
    authorId = 'user-123',
    content = 'test message',
    createdTimestamp = Date.now(),
) {
    return {
        id,
        content,
        author: {
            id: authorId,
            tag: 'MessageAuthor#1234',
        },
        createdTimestamp,
    } as any
}

function createChannel(id = 'channel-123') {
    return {
        id,
        type: ChannelType.GuildText,
        messages: {
            fetch: jest.fn(async () => new Map()),
        },
        bulkDelete: jest.fn(async () => []),
    } as any
}

function createGuild(id = 'guild-123', name = 'Test Guild') {
    return {
        id,
        name,
    } as any
}

function createInteraction({
    guildId = 'guild-123',
    guild = null as any,
    channelId = 'channel-123',
    channel = null as any,
    userId = 'mod-123',
    userTag = 'Moderator#5678',
    amount = 10,
    filterUser = null as any,
    filterText = null as string | null,
} = {}) {
    const interaction = {
        guild: guild || createGuild(guildId),
        guildId,
        channel: channel || createChannel(channelId),
        channelId,
        user: { id: userId, tag: userTag },
        options: {
            getInteger: jest.fn((name: string) => {
                if (name === 'amount') return amount
                return null
            }),
            getUser: jest.fn((name: string) => {
                if (name === 'user') return filterUser
                return null
            }),
            getString: jest.fn((name: string) => {
                if (name === 'contains') return filterText
                return null
            }),
        },
    }

    return interaction as any
}

describe('purge command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('rejects command outside of guild', async () => {
        const interaction = {
            guild: null,
            channel: createChannel(),
            options: {
                getInteger: jest.fn(),
                getUser: jest.fn(),
                getString: jest.fn(),
            },
        } as any

        await purgeCommand.execute({ interaction } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                content: '❌ This command can only be used in a server.',
            },
        })
    })

    test('rejects command outside of text channel', async () => {
        const interaction = createInteraction()
        interaction.channel.type = ChannelType.GuildVoice

        await purgeCommand.execute({ interaction } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                content: '❌ This command can only be used in text channels.',
            },
        })
    })

    test('purges specified number of messages', async () => {
        const interaction = createInteraction({ amount: 5 })
        const messages = new Map([
            ['1', createMessage('1')],
            ['2', createMessage('2')],
            ['3', createMessage('3')],
            ['4', createMessage('4')],
            ['5', createMessage('5')],
        ])
        interaction.channel.messages.fetch.mockResolvedValue(messages)

        await purgeCommand.execute({ interaction } as any)

        expect(interaction.channel.bulkDelete).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ id: '1' }),
                expect.objectContaining({ id: '2' }),
                expect.objectContaining({ id: '3' }),
                expect.objectContaining({ id: '4' }),
                expect.objectContaining({ id: '5' }),
            ]),
            true,
        )
    })

    test('filters by user when specified', async () => {
        const filterUser = createUser('user-target', 'TargetUser#9999')
        const interaction = createInteraction({
            amount: 10,
            filterUser,
        })
        const messages = new Map([
            ['1', createMessage('1', 'user-target', 'from target')],
            ['2', createMessage('2', 'user-other', 'from other')],
            ['3', createMessage('3', 'user-target', 'from target again')],
        ])
        interaction.channel.messages.fetch.mockResolvedValue(messages)

        await purgeCommand.execute({ interaction } as any)

        const deletedMessages = interaction.channel.bulkDelete.mock.calls[0][0]
        expect(deletedMessages).toHaveLength(2)
        expect(deletedMessages.every((m: any) => m.author.id === 'user-target')).toBe(
            true,
        )
    })

    test('filters by text content when specified', async () => {
        const interaction = createInteraction({
            amount: 10,
            filterText: 'spam',
        })
        const messages = new Map([
            ['1', createMessage('1', 'user-123', 'this is spam')],
            ['2', createMessage('2', 'user-123', 'this is not related')],
            ['3', createMessage('3', 'user-123', 'SPAM in caps')],
        ])
        interaction.channel.messages.fetch.mockResolvedValue(messages)

        await purgeCommand.execute({ interaction } as any)

        const deletedMessages = interaction.channel.bulkDelete.mock.calls[0][0]
        expect(deletedMessages).toHaveLength(2)
        expect(
            deletedMessages.every((m: any) =>
                m.content.toLowerCase().includes('spam'),
            ),
        ).toBe(true)
    })

    test('respects 14-day message age limit', async () => {
        const interaction = createInteraction({ amount: 100 })
        const now = Date.now()
        const fifteenDaysMs = 15 * 24 * 60 * 60 * 1000
        const messages = new Map([
            ['1', createMessage('1', 'user-123', 'recent', now)],
            ['2', createMessage('2', 'user-123', 'old', now - fifteenDaysMs)],
            ['3', createMessage('3', 'user-123', 'recent', now - 1000)],
        ])
        interaction.channel.messages.fetch.mockResolvedValue(messages)

        await purgeCommand.execute({ interaction } as any)

        const deletedMessages = interaction.channel.bulkDelete.mock.calls[0][0]
        expect(deletedMessages).toHaveLength(2)
        expect(deletedMessages.map((m: any) => m.id)).not.toContain('2')
    })

    test('returns empty result message when no messages match', async () => {
        const interaction = createInteraction()
        const messages = new Map([
            ['1', createMessage('1', 'user-other', 'other content')],
        ])
        const filterUser = createUser('user-target', 'TargetUser#9999')
        interaction.options.getUser.mockReturnValue(filterUser)
        interaction.channel.messages.fetch.mockResolvedValue(messages)

        await purgeCommand.execute({ interaction } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                content: '❌ No messages found matching your criteria.',
            },
        })
        expect(interaction.channel.bulkDelete).not.toHaveBeenCalled()
    })

    test('shows success embed with deleted count', async () => {
        const interaction = createInteraction({ amount: 3 })
        const messages = new Map([
            ['1', createMessage('1')],
            ['2', createMessage('2')],
            ['3', createMessage('3')],
        ])
        interaction.channel.messages.fetch.mockResolvedValue(messages)

        await purgeCommand.execute({ interaction } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                embeds: [
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: '🗑️ Messages Purged',
                            fields: expect.arrayContaining([
                                expect.objectContaining({
                                    name: 'Deleted',
                                    value: '3 messages',
                                }),
                            ]),
                        }),
                    }),
                ],
            },
        })
    })

    test('includes filter info in embed', async () => {
        const filterUser = createUser('user-target', 'TargetUser#9999')
        const interaction = createInteraction({
            amount: 1,
            filterUser,
        })
        const messages = new Map([
            ['1', createMessage('1', 'user-target')],
        ])
        interaction.channel.messages.fetch.mockResolvedValue(messages)

        await purgeCommand.execute({ interaction } as any)

        const embedCall = interactionReplyMock.mock.calls[0][0]
        const embed = embedCall.content.embeds[0]
        const filterField = embed.data.fields.find((f: any) => f.name === 'Filter')

        expect(filterField).toBeDefined()
        expect(filterField.value).toContain('TargetUser#9999')
    })

    test('handles purge failure gracefully', async () => {
        const interaction = createInteraction()
        interaction.channel.messages.fetch.mockRejectedValue(
            new Error('Missing permissions'),
        )

        await purgeCommand.execute({ interaction } as any)

        expect(errorLogMock).toHaveBeenCalledWith({
            message: 'Failed to purge messages',
            error: expect.any(Error),
        })
        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                content:
                    '❌ Failed to purge messages. Please check permissions and try again.',
            },
        })
    })

    test('logs purge action', async () => {
        const interaction = createInteraction({ amount: 5 })
        const messages = new Map([
            ['1', createMessage('1')],
            ['2', createMessage('2')],
            ['3', createMessage('3')],
            ['4', createMessage('4')],
            ['5', createMessage('5')],
        ])
        interaction.channel.messages.fetch.mockResolvedValue(messages)

        await purgeCommand.execute({ interaction } as any)

        expect(infoLogMock).toHaveBeenCalledWith({
            message: expect.stringContaining('Moderator#5678'),
        })
        expect(infoLogMock).toHaveBeenCalledWith({
            message: expect.stringContaining('5 messages'),
        })
    })
})
