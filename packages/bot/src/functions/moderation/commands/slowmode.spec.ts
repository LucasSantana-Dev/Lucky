import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import slowmodeCommand from './slowmode.js'

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

function createChannel(id = 'channel-123', name = 'general') {
    return {
        id,
        name,
        setRateLimitPerUser: jest.fn(async () => null),
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
    seconds = 10,
} = {}) {
    const interaction = {
        guild: guild || createGuild(guildId),
        guildId,
        channel: channel || createChannel(channelId),
        channelId,
        user: { id: userId, tag: userTag },
        options: {
            getInteger: jest.fn((name: string) => {
                if (name === 'seconds') return seconds
                return null
            }),
        },
    }

    return interaction as any
}

describe('slowmode command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('rejects command outside of guild', async () => {
        const interaction = {
            guild: null,
            channel: createChannel(),
            options: {
                getInteger: jest.fn(),
            },
        } as any

        await slowmodeCommand.execute({ interaction } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                content: '❌ This command can only be used in a server.',
            },
        })
    })

    test('sets slowmode with 10 second duration', async () => {
        const interaction = createInteraction({ seconds: 10 })

        await slowmodeCommand.execute({ interaction } as any)

        expect(interaction.channel.setRateLimitPerUser).toHaveBeenCalledWith(10)
    })

    test('disables slowmode with 0 seconds', async () => {
        const interaction = createInteraction({ seconds: 0 })

        await slowmodeCommand.execute({ interaction } as any)

        expect(interaction.channel.setRateLimitPerUser).toHaveBeenCalledWith(0)
    })

    test('sets slowmode with 1 minute (60 seconds)', async () => {
        const interaction = createInteraction({ seconds: 60 })

        await slowmodeCommand.execute({ interaction } as any)

        expect(interaction.channel.setRateLimitPerUser).toHaveBeenCalledWith(60)
    })

    test('sets slowmode with 1 hour (3600 seconds)', async () => {
        const interaction = createInteraction({ seconds: 3600 })

        await slowmodeCommand.execute({ interaction } as any)

        expect(interaction.channel.setRateLimitPerUser).toHaveBeenCalledWith(3600)
    })

    test('shows enabled embed with seconds format', async () => {
        const interaction = createInteraction({ seconds: 30 })

        await slowmodeCommand.execute({ interaction } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                embeds: [
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: '⏱️ Slowmode Enabled',
                            color: 0xff9800,
                            fields: expect.arrayContaining([
                                expect.objectContaining({
                                    name: 'Duration',
                                    value: '30s',
                                }),
                            ]),
                        }),
                    }),
                ],
            },
        })
    })

    test('shows enabled embed with minutes format', async () => {
        const interaction = createInteraction({ seconds: 120 })

        await slowmodeCommand.execute({ interaction } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                embeds: [
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: '⏱️ Slowmode Enabled',
                            fields: expect.arrayContaining([
                                expect.objectContaining({
                                    name: 'Duration',
                                    value: '2m',
                                }),
                            ]),
                        }),
                    }),
                ],
            },
        })
    })

    test('shows enabled embed with hours format', async () => {
        const interaction = createInteraction({ seconds: 7200 })

        await slowmodeCommand.execute({ interaction } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                embeds: [
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: '⏱️ Slowmode Enabled',
                            fields: expect.arrayContaining([
                                expect.objectContaining({
                                    name: 'Duration',
                                    value: '2h',
                                }),
                            ]),
                        }),
                    }),
                ],
            },
        })
    })

    test('shows disabled embed when setting to 0', async () => {
        const interaction = createInteraction({ seconds: 0 })

        await slowmodeCommand.execute({ interaction } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                embeds: [
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: '⏱️ Slowmode Disabled',
                            color: 0x4caf50,
                            fields: expect.arrayContaining([
                                expect.objectContaining({
                                    name: 'Duration',
                                    value: 'disabled',
                                }),
                            ]),
                        }),
                    }),
                ],
            },
        })
    })

    test('includes moderator info in embed', async () => {
        const interaction = createInteraction({ seconds: 10 })

        await slowmodeCommand.execute({ interaction } as any)

        const embedCall = interactionReplyMock.mock.calls[0][0]
        const embed = embedCall.content.embeds[0]
        const modField = embed.data.fields.find(
            (f: any) => f.name === 'Moderator',
        )

        expect(modField).toBeDefined()
        expect(modField.value).toBe('Moderator#5678')
    })

    test('logs slowmode enable action', async () => {
        const interaction = createInteraction({ seconds: 60 })

        await slowmodeCommand.execute({ interaction } as any)

        expect(infoLogMock).toHaveBeenCalledWith({
            message: expect.stringContaining('set slowmode'),
        })
        expect(infoLogMock).toHaveBeenCalledWith({
            message: expect.stringContaining('Moderator#5678'),
        })
    })

    test('logs slowmode disable action', async () => {
        const interaction = createInteraction({ seconds: 0 })

        await slowmodeCommand.execute({ interaction } as any)

        expect(infoLogMock).toHaveBeenCalledWith({
            message: expect.stringContaining('disabled slowmode'),
        })
    })

    test('handles slowmode failure gracefully', async () => {
        const interaction = createInteraction({ seconds: 10 })
        interaction.channel.setRateLimitPerUser.mockRejectedValue(
            new Error('Missing permissions'),
        )

        await slowmodeCommand.execute({ interaction } as any)

        expect(errorLogMock).toHaveBeenCalledWith({
            message: 'Failed to set slowmode',
            error: expect.any(Error),
        })
        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                content:
                    '❌ Failed to set slowmode. Please check permissions and try again.',
            },
        })
    })

    test('handles maximum slowmode duration (6 hours)', async () => {
        const interaction = createInteraction({ seconds: 21600 })

        await slowmodeCommand.execute({ interaction } as any)

        expect(interaction.channel.setRateLimitPerUser).toHaveBeenCalledWith(
            21600,
        )
        expect(interactionReplyMock).toHaveBeenCalled()
    })
})
