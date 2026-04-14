import {
    beforeEach,
    describe,
    expect,
    it,
    jest,
    afterEach,
} from '@jest/globals'
import giveawayCommand, { parseDuration, activeGiveaways } from './giveaway'

const interactionReplyMock = jest.fn()
const createSuccessEmbedMock = jest.fn(
    (title: string, description: string) => ({
        type: 'success',
        title,
        description,
    }),
)
const createErrorEmbedMock = jest.fn((title: string, description: string) => ({
    type: 'error',
    title,
    description,
}))
const requireGuildMock = jest.fn()

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createSuccessEmbed: (...args: unknown[]) => createSuccessEmbedMock(...args),
    createErrorEmbed: (...args: unknown[]) => createErrorEmbedMock(...args),
}))

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: (...args: unknown[]) => requireGuildMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
}))

function createInteraction(
    subcommand: string,
    opts: Record<string, unknown> = {},
) {
    return {
        guild: { id: 'guild-1' },
        channelId: 'channel-1',
        channel: {
            send: jest.fn().mockResolvedValue({
                id: 'message-1',
                url: 'https://discord.com/channels/guild-1/channel-1/message-1',
                react: jest.fn().mockResolvedValue(undefined),
            }),
        },
        options: {
            getSubcommand: () => subcommand,
            getString: () => opts.value ?? 'test-value',
            getInteger: () => opts.winners ?? 1,
        },
    }
}

describe('giveaway command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireGuildMock.mockResolvedValue(true)
        activeGiveaways.clear()
    })

    afterEach(() => {
        activeGiveaways.forEach((g) => clearTimeout(g.timeoutId))
        activeGiveaways.clear()
    })

    it('should be a valid command', () => {
        expect(giveawayCommand.data.name).toBe('giveaway')
    })

    describe('parseDuration', () => {
        it('should parse hours', () => {
            expect(parseDuration('1h')).toBe(3600000)
        })

        it('should parse minutes', () => {
            expect(parseDuration('30m')).toBe(1800000)
        })

        it('should parse days', () => {
            expect(parseDuration('2d')).toBe(172800000)
        })

        it('should parse combined durations', () => {
            expect(parseDuration('1h30m')).toBe(5400000)
        })

        it('should return 0 for invalid duration', () => {
            expect(parseDuration('invalid')).toBe(0)
        })
    })

    it('should start a giveaway', async () => {
        const interaction = createInteraction('start', { value: '1h' }) as any
        interaction.options.getString = jest
            .fn()
            .mockReturnValueOnce('1h')
            .mockReturnValueOnce('Discord Nitro')

        await giveawayCommand.execute({
            interaction,
        })

        expect(interactionReplyMock).toHaveBeenCalled()
    })

    it('should reject invalid duration', async () => {
        const interaction = createInteraction('start') as any
        interaction.options.getString = jest.fn().mockReturnValueOnce('invalid')

        await giveawayCommand.execute({
            interaction,
        })

        expect(interactionReplyMock).toHaveBeenCalled()
    })

    it('should handle end subcommand', async () => {
        await giveawayCommand.execute({
            interaction: createInteraction('end') as any,
        })

        expect(interactionReplyMock).toHaveBeenCalled()
    })

    it('should handle reroll subcommand', async () => {
        await giveawayCommand.execute({
            interaction: createInteraction('reroll') as any,
        })

        expect(interactionReplyMock).toHaveBeenCalled()
    })

    it('starts giveaway when channel is text-based', async () => {
        jest.useFakeTimers()
        const sendMock = jest.fn().mockResolvedValue({
            id: 'msg-1',
            url: 'https://discord.com/channels/g/c/msg-1',
            react: jest.fn().mockResolvedValue(undefined),
        })
        const interaction = {
            guild: { id: 'guild-1' },
            channelId: 'ch-1',
            channel: { isTextBased: () => true, send: sendMock },
            options: {
                getSubcommand: () => 'start',
                getString: jest
                    .fn()
                    .mockReturnValueOnce('1h')
                    .mockReturnValueOnce('Nitro'),
                getInteger: jest.fn().mockReturnValue(2),
            },
        }
        await giveawayCommand.execute({ interaction: interaction as never })
        expect(sendMock).toHaveBeenCalled()
        expect(activeGiveaways.size).toBe(1)
        expect(interactionReplyMock).toHaveBeenCalled()
        jest.useRealTimers()
    })

    it('errors when channel is not text-based', async () => {
        const interaction = {
            guild: { id: 'guild-1' },
            channelId: 'ch-1',
            channel: { isTextBased: () => false },
            options: {
                getSubcommand: () => 'start',
                getString: jest
                    .fn()
                    .mockReturnValueOnce('1h')
                    .mockReturnValueOnce('Prize'),
                getInteger: jest.fn().mockReturnValue(1),
            },
        }
        await giveawayCommand.execute({ interaction: interaction as never })
        expect(createErrorEmbedMock).toHaveBeenCalledWith(
            'Error',
            expect.stringContaining('not text-based'),
        )
    })

    it('ends existing giveaway successfully', async () => {
        const timeoutId = setTimeout(() => {}, 999999)
        activeGiveaways.set('existing-msg', {
            messageId: 'existing-msg',
            channelId: 'ch-1',
            guildId: 'guild-1',
            prize: 'Test Prize',
            winnersCount: 1,
            endTime: Date.now() + 60000,
            entries: new Set(['user-1']),
            timeoutId,
        })
        const interaction = {
            guild: { id: 'guild-1' },
            options: {
                getSubcommand: () => 'end',
                getString: jest.fn().mockReturnValue('existing-msg'),
            },
        }
        await giveawayCommand.execute({ interaction: interaction as never })
        expect(createSuccessEmbedMock).toHaveBeenCalledWith(
            'Giveaway Ended',
            expect.any(String),
        )
    })

    it('reports error when ending nonexistent giveaway', async () => {
        const interaction = {
            guild: { id: 'guild-1' },
            options: {
                getSubcommand: () => 'end',
                getString: jest.fn().mockReturnValue('no-such-msg'),
            },
        }
        await giveawayCommand.execute({ interaction: interaction as never })
        expect(createErrorEmbedMock).toHaveBeenCalledWith(
            'Not Found',
            expect.any(String),
        )
    })

    it('rerolls existing giveaway', async () => {
        const timeoutId = setTimeout(() => {}, 999999)
        activeGiveaways.set('reroll-msg', {
            messageId: 'reroll-msg',
            channelId: 'ch-1',
            guildId: 'guild-1',
            prize: 'Reroll Prize',
            winnersCount: 1,
            endTime: Date.now() + 60000,
            entries: new Set(['user-1', 'user-2']),
            timeoutId,
        })
        const interaction = {
            guild: { id: 'guild-1' },
            options: {
                getSubcommand: () => 'reroll',
                getString: jest.fn().mockReturnValue('reroll-msg'),
            },
        }
        await giveawayCommand.execute({ interaction: interaction as never })
        expect(createSuccessEmbedMock).toHaveBeenCalledWith(
            'Rerolled',
            expect.any(String),
        )
    })

    it('handles execute errors gracefully', async () => {
        const interaction = {
            guild: { id: 'guild-1' },
            options: {
                getSubcommand: () => 'start',
                getString: jest.fn().mockImplementation(() => {
                    throw new Error('unexpected')
                }),
                getInteger: jest.fn().mockReturnValue(1),
            },
        }
        await giveawayCommand.execute({ interaction: interaction as never })
        expect(createErrorEmbedMock).toHaveBeenCalledWith(
            'Error',
            expect.any(String),
        )
    })
})
