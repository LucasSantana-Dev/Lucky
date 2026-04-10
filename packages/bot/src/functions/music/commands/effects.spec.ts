import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import effectsCommand from './effects'

const requireGuildMock = jest.fn()
const requireQueueMock = jest.fn()
const requireIsPlayingMock = jest.fn()
const interactionReplyMock = jest.fn()
const createSuccessEmbedMock = jest.fn((title: string, desc?: string) => ({
    title,
    description: desc,
    color: 0x00ff00,
}))
const createErrorEmbedMock = jest.fn((title: string, desc?: string) => ({
    title,
    description: desc,
    color: 0xff0000,
}))
const resolveGuildQueueMock = jest.fn()

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: (...args: unknown[]) => requireGuildMock(...args),
    requireQueue: (...args: unknown[]) => requireQueueMock(...args),
    requireIsPlaying: (...args: unknown[]) => requireIsPlayingMock(...args),
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createSuccessEmbed: (...args: unknown[]) => createSuccessEmbedMock(...args),
    createErrorEmbed: (...args: unknown[]) => createErrorEmbedMock(...args),
}))

jest.mock('../../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

function createInteraction(guildId = 'guild-1', subcommand = 'bassboost', level?: number) {
    const interaction = {
        guildId,
        options: {
            getSubcommand: jest.fn().mockReturnValue(subcommand),
            getInteger: jest.fn((name) => {
                if (name === 'level') return level ?? 2
                return null
            }),
        },
    } as any
    return interaction
}

function createQueue() {
    return {
        isPlaying: jest.fn().mockReturnValue(true),
        filters: {
            ffmpeg: {
                toggle: jest.fn(),
                setFilters: jest.fn(),
            },
            resampler: {
                toggleFilter: jest.fn().mockReturnValue(false),
            },
        },
    } as any
}

describe('effects command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireGuildMock.mockResolvedValue(true)
        requireQueueMock.mockResolvedValue(true)
        requireIsPlayingMock.mockResolvedValue(true)
    })

    it('returns early when guild validation fails', async () => {
        requireGuildMock.mockResolvedValue(false)
        const queue = createQueue()
        resolveGuildQueueMock.mockReturnValue({ queue })

        await effectsCommand.execute({ client: {} as any, interaction: createInteraction() } as any)

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('returns early when queue validation fails', async () => {
        requireQueueMock.mockResolvedValue(false)
        const queue = createQueue()
        resolveGuildQueueMock.mockReturnValue({ queue })

        await effectsCommand.execute({ client: {} as any, interaction: createInteraction() } as any)

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('returns early when music is not playing', async () => {
        requireIsPlayingMock.mockResolvedValue(false)
        const queue = createQueue()
        resolveGuildQueueMock.mockReturnValue({ queue })

        await effectsCommand.execute({ client: {} as any, interaction: createInteraction() } as any)

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('applies bass boost level', async () => {
        const queue = createQueue()
        resolveGuildQueueMock.mockReturnValue({ queue })

        await effectsCommand.execute({
            client: {} as any,
            interaction: createInteraction('guild-1', 'bassboost', 3),
        } as any)

        expect(queue.filters.ffmpeg.toggle).toHaveBeenCalled()
        expect(interactionReplyMock).toHaveBeenCalled()
        expect(createSuccessEmbedMock).toHaveBeenCalledWith('Bass boost', expect.stringContaining('Bass boost level set to 3'))
    })

    it('rejects invalid bass boost level', async () => {
        const queue = createQueue()
        resolveGuildQueueMock.mockReturnValue({ queue })

        await effectsCommand.execute({
            client: {} as any,
            interaction: createInteraction('guild-1', 'bassboost', 10),
        } as any)

        expect(queue.filters.ffmpeg.toggle).not.toHaveBeenCalled()
        expect(createErrorEmbedMock).toHaveBeenCalledWith('Error', expect.stringContaining('must be between 0 and 5'))
    })

    it('toggles nightcore effect', async () => {
        const queue = createQueue()
        resolveGuildQueueMock.mockReturnValue({ queue })

        await effectsCommand.execute({
            client: {} as any,
            interaction: createInteraction('guild-1', 'nightcore'),
        } as any)

        expect(queue.filters.resampler.toggleFilter).toHaveBeenCalledWith('nightcore')
        expect(createSuccessEmbedMock).toHaveBeenCalledWith('Nightcore', expect.any(String))
    })

    it('resets all effects', async () => {
        const queue = createQueue()
        resolveGuildQueueMock.mockReturnValue({ queue })

        await effectsCommand.execute({
            client: {} as any,
            interaction: createInteraction('guild-1', 'reset'),
        } as any)

        expect(queue.filters.ffmpeg.setFilters).toHaveBeenCalledWith([])
        expect(queue.filters.resampler.toggleFilter).toHaveBeenCalledWith('nightcore')
        expect(createSuccessEmbedMock).toHaveBeenCalledWith('Effects reset', expect.stringContaining('All effects have been cleared'))
    })
})
