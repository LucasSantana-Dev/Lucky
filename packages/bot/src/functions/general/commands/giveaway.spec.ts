import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const interactionReplyMock = jest.fn()
const giveawayServiceMock = {
    create: jest.fn(),
    endById: jest.fn(),
    reroll: jest.fn(),
    getById: jest.fn(),
    updateMessageId: jest.fn(),
}
const infoLogMock = jest.fn()
const errorLogMock = jest.fn()
const parseDurationMock = jest.fn()
const prismaDeleteMock = jest.fn()

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('@lucky/shared/services', () => ({
    giveawayService: giveawayServiceMock,
    parseDuration: (...args: unknown[]) => parseDurationMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    infoLog: (...args: unknown[]) => infoLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('@lucky/shared/utils/database/prismaClient', () => ({
    getPrismaClient: () => ({
        giveaway: {
            delete: (...args: unknown[]) => prismaDeleteMock(...args),
        },
    }),
}))

// Import after mocking
import giveawayCommand from './giveaway'

function makeStartInteraction(
    prize = 'Nintendo Switch',
    duracao = '1h',
    vencedores = 1,
) {
    return {
        guildId: 'guild-1',
        channelId: 'channel-1',
        user: { id: 'user-1', tag: 'User#0001' },
        guild: {
            members: {
                me: {
                    id: 'bot-id',
                },
                fetchMe: jest.fn().mockResolvedValue({ id: 'bot-id' }),
            },
        },
        client: {
            channels: {
                cache: {
                    get: jest.fn(),
                },
            },
        },
        options: {
            getSubcommand: jest.fn().mockReturnValue('start'),
            getString: jest.fn((name) => {
                if (name === 'premio') return prize
                if (name === 'duracao') return duracao
                return null
            }),
            getInteger: jest.fn((name) => {
                if (name === 'vencedores') return vencedores
                return null
            }),
        },
    } as any
}

function makeEndInteraction(id = 'giveaway-123') {
    return {
        guildId: 'guild-1',
        channelId: 'channel-1',
        user: { id: 'user-1' },
        client: {
            channels: {
                cache: {
                    get: jest.fn(),
                },
            },
        },
        options: {
            getSubcommand: jest.fn().mockReturnValue('end'),
            getString: jest.fn().mockReturnValue(id),
        },
    } as any
}

function makeTextChannel() {
    return {
        type: 0, // GuildText
        permissionsFor: jest.fn().mockReturnValue({
            has: jest.fn().mockReturnValue(true),
        }),
        send: jest.fn().mockResolvedValue({
            react: jest.fn().mockResolvedValue({}),
            url: 'https://discord.com/channels/guild/channel/msg',
            id: 'msg-1',
        }),
        messages: {
            fetch: jest.fn().mockResolvedValue({
                edit: jest.fn().mockResolvedValue({}),
            }),
        },
    } as any
}

describe('giveaway command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('start subcommand', () => {
        it('has correct command name', () => {
            expect(giveawayCommand.data.name).toBe('giveaway')
        })

        it('requires ManageGuild permission', () => {
            const permissions = giveawayCommand.data.default_member_permissions
            expect(permissions).toBeDefined()
        })

        it('rejects missing guild context on start', async () => {
            const interaction = makeStartInteraction()
            interaction.guildId = null
            parseDurationMock.mockReturnValue(3600000)

            await giveawayCommand.execute({ interaction } as any)

            expect(interactionReplyMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.objectContaining({
                        content: expect.stringContaining(
                            'Guild or channel context missing',
                        ),
                    }),
                }),
            )
        })

        it('rejects invalid duration format', async () => {
            const interaction = makeStartInteraction()
            parseDurationMock.mockReturnValue(null)

            await giveawayCommand.execute({ interaction } as any)

            expect(interactionReplyMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.objectContaining({
                        content: expect.stringContaining('Invalid duration'),
                    }),
                }),
            )
        })

        it('rejects duration exceeding 14 days', async () => {
            const interaction = makeStartInteraction()
            parseDurationMock.mockReturnValue(15 * 24 * 60 * 60 * 1000) // 15 days

            await giveawayCommand.execute({ interaction } as any)

            expect(interactionReplyMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.objectContaining({
                        content: expect.stringContaining('Invalid duration'),
                    }),
                }),
            )
        })

        it('creates giveaway record with correct params', async () => {
            const interaction = makeStartInteraction()
            interaction.client.channels.cache.get.mockReturnValue(
                makeTextChannel(),
            )
            parseDurationMock.mockReturnValue(3600000)
            giveawayServiceMock.create.mockResolvedValue({ id: 'giveaway-1' })

            await giveawayCommand.execute({ interaction } as any)

            expect(giveawayServiceMock.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    guildId: 'guild-1',
                    channelId: 'channel-1',
                    prize: 'Nintendo Switch',
                    winnersCount: 1,
                    createdBy: 'user-1',
                }),
            )
        })

        it('posts message to channel with react', async () => {
            const interaction = makeStartInteraction()
            const channel = makeTextChannel()
            interaction.client.channels.cache.get.mockReturnValue(channel)
            parseDurationMock.mockReturnValue(3600000)
            giveawayServiceMock.create.mockResolvedValue({ id: 'giveaway-1' })

            await giveawayCommand.execute({ interaction } as any)

            expect(channel.send).toHaveBeenCalled()
        })

        it('updates message ID after successful post', async () => {
            const interaction = makeStartInteraction()
            const channel = makeTextChannel()
            interaction.client.channels.cache.get.mockReturnValue(channel)
            parseDurationMock.mockReturnValue(3600000)
            giveawayServiceMock.create.mockResolvedValue({ id: 'giveaway-1' })

            await giveawayCommand.execute({ interaction } as any)

            expect(giveawayServiceMock.updateMessageId).toHaveBeenCalledWith(
                'giveaway-1',
                'msg-1',
            )
        })

        it('cleans up DB record if message post fails', async () => {
            const interaction = makeStartInteraction()
            const channel = makeTextChannel()
            channel.send.mockRejectedValue(new Error('Send failed'))
            interaction.client.channels.cache.get.mockReturnValue(channel)
            parseDurationMock.mockReturnValue(3600000)
            giveawayServiceMock.create.mockResolvedValue({ id: 'giveaway-1' })

            await giveawayCommand.execute({ interaction } as any)

            expect(prismaDeleteMock).toHaveBeenCalledWith(
                expect.objectContaining({ where: { id: 'giveaway-1' } }),
            )
        })

        it('uses default winner count of 1', async () => {
            const interaction = makeStartInteraction('Prize', '1h', null)
            interaction.client.channels.cache.get.mockReturnValue(
                makeTextChannel(),
            )
            parseDurationMock.mockReturnValue(3600000)
            giveawayServiceMock.create.mockResolvedValue({ id: 'giveaway-1' })

            await giveawayCommand.execute({ interaction } as any)

            expect(giveawayServiceMock.create).toHaveBeenCalledWith(
                expect.objectContaining({ winnersCount: 1 }),
            )
        })

        it('logs successful giveaway start', async () => {
            const interaction = makeStartInteraction()
            interaction.client.channels.cache.get.mockReturnValue(
                makeTextChannel(),
            )
            parseDurationMock.mockReturnValue(3600000)
            giveawayServiceMock.create.mockResolvedValue({ id: 'giveaway-1' })

            await giveawayCommand.execute({ interaction } as any)

            expect(infoLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('giveaway start'),
                    data: expect.objectContaining({ giveawayId: 'giveaway-1' }),
                }),
            )
        })
    })

    describe('end subcommand', () => {
        it('rejects missing guild context on end', async () => {
            const interaction = makeEndInteraction()
            interaction.guildId = null

            await giveawayCommand.execute({ interaction } as any)

            expect(interactionReplyMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.objectContaining({
                        content: expect.stringContaining(
                            'Guild context missing',
                        ),
                    }),
                }),
            )
        })

        it('returns error when giveaway not found', async () => {
            const interaction = makeEndInteraction()
            giveawayServiceMock.endById.mockResolvedValue(null)

            await giveawayCommand.execute({ interaction } as any)

            expect(interactionReplyMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.objectContaining({
                        content: expect.stringContaining('not found'),
                    }),
                }),
            )
        })

        it('handles already-ended giveaway', async () => {
            const interaction = makeEndInteraction()
            interaction.client.channels.cache.get.mockReturnValue(
                makeTextChannel(),
            )
            giveawayServiceMock.endById.mockResolvedValue({
                giveaway: { winnerIds: ['winner-1'], prize: 'Prize' },
                wasAlreadyEnded: true,
            })

            await giveawayCommand.execute({ interaction } as any)

            expect(interactionReplyMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.objectContaining({
                        content: expect.stringContaining('already ended'),
                    }),
                }),
            )
        })

        it('ends giveaway and announces winners', async () => {
            const interaction = makeEndInteraction()
            const channel = makeTextChannel()
            interaction.client.channels.cache.get.mockReturnValue(channel)
            giveawayServiceMock.endById.mockResolvedValue({
                giveaway: {
                    winnerIds: ['winner-1'],
                    messageId: 'msg-1',
                    prize: 'Prize',
                    channelId: 'channel-1',
                },
                wasAlreadyEnded: false,
            })

            await giveawayCommand.execute({ interaction } as any)

            expect(channel.send).toHaveBeenCalled()
        })

        it('logs giveaway end with winners', async () => {
            const interaction = makeEndInteraction('giveaway-1')
            interaction.client.channels.cache.get.mockReturnValue(
                makeTextChannel(),
            )
            giveawayServiceMock.endById.mockResolvedValue({
                giveaway: {
                    winnerIds: ['winner-1'],
                    messageId: 'msg-1',
                    prize: 'Prize',
                    channelId: 'channel-1',
                },
                wasAlreadyEnded: false,
            })

            await giveawayCommand.execute({ interaction } as any)

            expect(infoLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('giveaway end'),
                    data: expect.objectContaining({ giveawayId: 'giveaway-1' }),
                }),
            )
        })
    })

    describe('reroll subcommand', () => {
        it('returns error when giveaway not found on reroll', async () => {
            const interaction = makeEndInteraction()
            interaction.options.getSubcommand.mockReturnValue('reroll')
            giveawayServiceMock.getById.mockResolvedValue(null)

            await giveawayCommand.execute({ interaction } as any)

            expect(interactionReplyMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.objectContaining({
                        content: expect.stringContaining('not found'),
                    }),
                }),
            )
        })

        it('returns error when giveaway not ended', async () => {
            const interaction = makeEndInteraction()
            interaction.options.getSubcommand.mockReturnValue('reroll')
            giveawayServiceMock.getById.mockResolvedValue({ id: 'giveaway-1' })
            giveawayServiceMock.reroll.mockResolvedValue(null)

            await giveawayCommand.execute({ interaction } as any)

            expect(interactionReplyMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.objectContaining({
                        content: expect.stringContaining('not ended yet'),
                    }),
                }),
            )
        })

        it('rerolls and announces new winners', async () => {
            const interaction = makeEndInteraction()
            interaction.options.getSubcommand.mockReturnValue('reroll')
            const channel = makeTextChannel()
            interaction.client.channels.cache.get.mockReturnValue(channel)
            giveawayServiceMock.getById.mockResolvedValue({
                id: 'giveaway-1',
                prize: 'Prize',
                messageId: 'msg-1',
                channelId: 'channel-1',
            })
            giveawayServiceMock.reroll.mockResolvedValue(['new-winner-1'])

            await giveawayCommand.execute({ interaction } as any)

            expect(channel.send).toHaveBeenCalled()
        })

        it('logs reroll with new winners', async () => {
            const interaction = makeEndInteraction('giveaway-1')
            interaction.options.getSubcommand.mockReturnValue('reroll')
            const channel = makeTextChannel()
            interaction.client.channels.cache.get.mockReturnValue(channel)
            giveawayServiceMock.getById.mockResolvedValue({
                id: 'giveaway-1',
                prize: 'Prize',
                messageId: 'msg-1',
                channelId: 'channel-1',
            })
            giveawayServiceMock.reroll.mockResolvedValue(['new-winner-1'])

            await giveawayCommand.execute({ interaction } as any)

            expect(infoLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('reroll'),
                    data: expect.objectContaining({
                        giveawayId: 'giveaway-1',
                        winners: ['new-winner-1'],
                    }),
                }),
            )
        })
    })

    describe('error handling', () => {
        it('replies ephemeral on all error responses', async () => {
            const interaction = makeStartInteraction()
            interaction.guildId = null

            await giveawayCommand.execute({ interaction } as any)

            expect(interactionReplyMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.objectContaining({
                        ephemeral: true,
                    }),
                }),
            )
        })
    })
})
