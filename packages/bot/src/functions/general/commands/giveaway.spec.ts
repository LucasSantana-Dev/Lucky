import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import giveawayCommand, { parseDuration } from './giveaway'

const interactionReplyMock = jest.fn()
const createSuccessEmbedMock = jest.fn((title: string, description: string) => ({ type: 'success', title, description }))
const createErrorEmbedMock = jest.fn((title: string, description: string) => ({ type: 'error', title, description }))
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

function createInteraction(subcommand: string, opts: Record<string, unknown> = {}) {
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
        interaction.options.getString = jest.fn()
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
})
