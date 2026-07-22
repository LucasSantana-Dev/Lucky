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
const resolveGuildQueueMock = jest.fn()
const debugLogMock = jest.fn()
const errorLogMock = jest.fn()

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

jest.mock('../../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

function createQueue(trackCount: number = 5) {
    return {
        tracks: {
            size: trackCount,
        },
        clear: jest.fn(),
    } as any
}

function makeInteraction() {
    return {
        guildId: 'guild-1',
    } as any
}

describe('clear command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireGuildMock.mockResolvedValue(true)
        requireQueueMock.mockResolvedValue(true)
    })

    it('has correct command name', () => {
        expect(clearCommand.data.name).toBe('clear')
    })

    it('returns early when guild validation fails', async () => {
        requireGuildMock.mockResolvedValue(false)
        resolveGuildQueueMock.mockReturnValue({ queue: createQueue() })

        await clearCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('returns early when queue validation fails', async () => {
        requireQueueMock.mockResolvedValue(false)
        resolveGuildQueueMock.mockReturnValue({ queue: createQueue() })

        await clearCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('shows error when queue is empty', async () => {
        const queue = createQueue(0)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await clearCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(createErrorEmbedMock).toHaveBeenCalledWith(
            'Empty queue',
            expect.stringContaining('already empty'),
        )
        expect(queue.clear).not.toHaveBeenCalled()
    })

    it('clears queue when tracks exist', async () => {
        const queue = createQueue(5)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await clearCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(queue.clear).toHaveBeenCalled()
    })

    it('responds with success message and count', async () => {
        const queue = createQueue(5)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await clearCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(createSuccessEmbedMock).toHaveBeenCalledWith(
            'Queue cleared',
            expect.stringContaining('5'),
        )
    })

    it('logs cleared track count', async () => {
        const queue = createQueue(5)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await clearCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(debugLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('5'),
            }),
        )
    })

    it('includes guild ID in debug log', async () => {
        const queue = createQueue(3)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await clearCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(debugLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('guild-1'),
            }),
        )
    })

    it('handles clear error gracefully', async () => {
        const queue = createQueue(5)
        queue.clear.mockImplementation(() => {
            throw new Error('Clear failed')
        })
        resolveGuildQueueMock.mockReturnValue({ queue })

        await clearCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('Error in clear command'),
            }),
        )
        expect(createErrorEmbedMock).toHaveBeenCalledWith(
            'Error',
            expect.stringContaining('error occurred'),
        )
    })

    it('replies ephemeral on error', async () => {
        const queue = createQueue(5)
        queue.clear.mockImplementation(() => {
            throw new Error('Clear failed')
        })
        resolveGuildQueueMock.mockReturnValue({ queue })

        await clearCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    ephemeral: true,
                }),
            }),
        )
    })

    it('replies ephemeral when queue is empty', async () => {
        const queue = createQueue(0)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await clearCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    ephemeral: true,
                }),
            }),
        )
    })

    it('clears queue with 1 track', async () => {
        const queue = createQueue(1)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await clearCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(queue.clear).toHaveBeenCalled()
        expect(createSuccessEmbedMock).toHaveBeenCalledWith(
            'Queue cleared',
            expect.stringContaining('1'),
        )
    })
})
