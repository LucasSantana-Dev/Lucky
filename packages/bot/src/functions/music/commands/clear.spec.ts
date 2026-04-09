import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import clearCommand from './clear'

const requireGuildMock = jest.fn()
const requireQueueMock = jest.fn()
const interactionReplyMock = jest.fn()
const createSuccessEmbedMock = jest.fn((title: string, desc?: string) => ({
    title,
    description: desc,
}))
const createErrorEmbedMock = jest.fn((title: string, desc?: string) => ({
    title,
    description: desc,
}))
const debugLogMock = jest.fn()
const errorLogMock = jest.fn()
const resolveGuildQueueMock = jest.fn()

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: (...args: unknown[]) => requireGuildMock(...args),
    requireQueue: (...args: unknown[]) => requireQueueMock(...args),
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createSuccessEmbed: (...args: unknown[]) => createSuccessEmbedMock(...args),
    createErrorEmbed: (...args: unknown[]) => createErrorEmbedMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('../../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

function createInteraction(guildId = 'guild-1') {
    return {
        guildId,
        user: { id: 'user-1' },
    } as any
}

function createQueue(trackCount = 10) {
    return {
        guild: { id: 'guild-1' },
        tracks: {
            size: trackCount,
        },
        clear: jest.fn(),
    } as any
}

function createClient() {
    return {
        player: {
            nodes: {
                get: jest.fn(),
            },
        },
    } as any
}

describe('clear command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireGuildMock.mockResolvedValue(true)
        requireQueueMock.mockResolvedValue(true)
    })

    it('clears the queue and sends success response with track count', async () => {
        const queue = createQueue(10)
        const client = createClient()
        const interaction = createInteraction()
        resolveGuildQueueMock.mockReturnValue({ queue })

        await clearCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.clear).toHaveBeenCalled()
        expect(debugLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('Cleared 10 tracks'),
            }),
        )
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                interaction,
            }),
        )
        expect(createSuccessEmbedMock).toHaveBeenCalledWith(
            'Queue cleared',
            '🗑️ Removed 10 songs from the queue!',
        )
    })

    it('shows error when queue is already empty', async () => {
        const queue = createQueue(0)
        const client = createClient()
        const interaction = createInteraction()
        resolveGuildQueueMock.mockReturnValue({ queue })

        await clearCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.clear).not.toHaveBeenCalled()
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    ephemeral: true,
                }),
            }),
        )
        expect(createErrorEmbedMock).toHaveBeenCalledWith(
            'Empty queue',
            '🗑️ The queue is already empty!',
        )
    })

    it('returns early when guild validation fails', async () => {
        requireGuildMock.mockResolvedValue(false)
        const queue = createQueue(10)
        const client = createClient()
        const interaction = createInteraction()
        resolveGuildQueueMock.mockReturnValue({ queue })

        await clearCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.clear).not.toHaveBeenCalled()
        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('returns early when queue validation fails', async () => {
        requireQueueMock.mockResolvedValue(false)
        const queue = createQueue(10)
        const client = createClient()
        const interaction = createInteraction()
        resolveGuildQueueMock.mockReturnValue({ queue })

        await clearCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.clear).not.toHaveBeenCalled()
        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('handles error thrown by discord-player gracefully', async () => {
        const queue = createQueue(10)
        const clearError = new Error('Discord player error')
        queue.clear.mockImplementation(() => {
            throw clearError
        })
        const client = createClient()
        const interaction = createInteraction()
        resolveGuildQueueMock.mockReturnValue({ queue })

        await clearCommand.execute({
            client,
            interaction,
        } as any)

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Error in clear command:',
                error: clearError,
            }),
        )
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    ephemeral: true,
                }),
            }),
        )
        expect(createErrorEmbedMock).toHaveBeenCalledWith(
            'Error',
            '🔄 An error occurred while clearing the queue!',
        )
    })

    it('clears queues with single track', async () => {
        const queue = createQueue(1)
        const client = createClient()
        const interaction = createInteraction()
        resolveGuildQueueMock.mockReturnValue({ queue })

        await clearCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.clear).toHaveBeenCalled()
        expect(createSuccessEmbedMock).toHaveBeenCalledWith(
            'Queue cleared',
            '🗑️ Removed 1 songs from the queue!',
        )
    })

    it('clears large queues with many tracks', async () => {
        const queue = createQueue(500)
        const client = createClient()
        const interaction = createInteraction()
        resolveGuildQueueMock.mockReturnValue({ queue })

        await clearCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.clear).toHaveBeenCalled()
        expect(createSuccessEmbedMock).toHaveBeenCalledWith(
            'Queue cleared',
            '🗑️ Removed 500 songs from the queue!',
        )
    })
})
