import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import removeCommand from './remove'

const requireGuildMock = jest.fn()
const requireVoiceChannelMock = jest.fn()
const requireQueueMock = jest.fn()
const requireCurrentTrackMock = jest.fn()
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

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: (...args: unknown[]) => requireGuildMock(...args),
    requireVoiceChannel: (...args: unknown[]) =>
        requireVoiceChannelMock(...args),
    requireQueue: (...args: unknown[]) => requireQueueMock(...args),
    requireCurrentTrack: (...args: unknown[]) =>
        requireCurrentTrackMock(...args),
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

function createQueue(trackCount: number = 3) {
    const tracks = Array.from({ length: trackCount }, (_, i) => ({
        title: `Track ${i + 1}`,
        author: `Artist ${i + 1}`,
        index: i,
    }))
    return {
        tracks: {
            size: trackCount,
            toArray: jest.fn().mockReturnValue(tracks),
            remove: jest.fn(),
        },
        currentTrack: { title: 'Current', author: 'Current Artist' },
    } as any
}

function makeInteraction(position: number | null = null) {
    return {
        guildId: 'guild-1',
        options: {
            getInteger: jest.fn().mockReturnValue(position),
        },
    } as any
}

describe('remove command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireGuildMock.mockResolvedValue(true)
        requireVoiceChannelMock.mockResolvedValue(true)
        requireQueueMock.mockResolvedValue(true)
        requireCurrentTrackMock.mockResolvedValue(true)
    })

    it('has correct command name', () => {
        expect(removeCommand.data.name).toBe('remove')
    })

    it('returns early when guild validation fails', async () => {
        requireGuildMock.mockResolvedValue(false)
        resolveGuildQueueMock.mockReturnValue({ queue: createQueue() })

        await removeCommand.execute({
            client: {} as any,
            interaction: makeInteraction(1),
        } as any)

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('returns early when voice channel validation fails', async () => {
        requireVoiceChannelMock.mockResolvedValue(false)
        resolveGuildQueueMock.mockReturnValue({ queue: createQueue() })

        await removeCommand.execute({
            client: {} as any,
            interaction: makeInteraction(1),
        } as any)

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('returns early when queue validation fails', async () => {
        requireQueueMock.mockResolvedValue(false)
        resolveGuildQueueMock.mockReturnValue({ queue: createQueue() })

        await removeCommand.execute({
            client: {} as any,
            interaction: makeInteraction(1),
        } as any)

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('returns early when no current track', async () => {
        requireCurrentTrackMock.mockResolvedValue(false)
        resolveGuildQueueMock.mockReturnValue({ queue: createQueue() })

        await removeCommand.execute({
            client: {} as any,
            interaction: makeInteraction(1),
        } as any)

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('removes track at valid position', async () => {
        const queue = createQueue(3)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await removeCommand.execute({
            client: {} as any,
            interaction: makeInteraction(1),
        } as any)

        expect(queue.tracks.remove).toHaveBeenCalled()
        expect(createSuccessEmbedMock).toHaveBeenCalledWith(
            'Song removed',
            expect.stringContaining('Track 1'),
        )
    })

    it('converts 1-based position to 0-based index', async () => {
        const queue = createQueue(3)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await removeCommand.execute({
            client: {} as any,
            interaction: makeInteraction(2),
        } as any)

        expect(queue.tracks.remove).toHaveBeenCalledWith(expect.any(Function))
        // Verify the removal function was called with correct index
        const removeCallback = queue.tracks.remove.mock.calls[0][0]
        expect(removeCallback(null, 1)).toBe(true) // position 2 (1-based) = index 1 (0-based)
        expect(removeCallback(null, 0)).toBe(false) // position 1 (1-based) should not match index 0
    })

    it('rejects position 0', async () => {
        const queue = createQueue(3)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await removeCommand.execute({
            client: {} as any,
            interaction: makeInteraction(0),
        } as any)

        expect(createErrorEmbedMock).toHaveBeenCalledWith(
            'Error',
            'Invalid position!',
        )
        expect(queue.tracks.remove).not.toHaveBeenCalled()
    })

    it('rejects position beyond queue size', async () => {
        const queue = createQueue(3)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await removeCommand.execute({
            client: {} as any,
            interaction: makeInteraction(5),
        } as any)

        expect(createErrorEmbedMock).toHaveBeenCalledWith(
            'Error',
            'Invalid position!',
        )
        expect(queue.tracks.remove).not.toHaveBeenCalled()
    })

    it('rejects negative position', async () => {
        const queue = createQueue(3)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await removeCommand.execute({
            client: {} as any,
            interaction: makeInteraction(-1),
        } as any)

        expect(createErrorEmbedMock).toHaveBeenCalledWith(
            'Error',
            'Invalid position!',
        )
    })

    it('handles empty queue', async () => {
        const queue = createQueue(0)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await removeCommand.execute({
            client: {} as any,
            interaction: makeInteraction(1),
        } as any)

        expect(createErrorEmbedMock).toHaveBeenCalledWith(
            'Error',
            'The queue is empty!',
        )
        expect(queue.tracks.remove).not.toHaveBeenCalled()
    })

    it('responds with removed track details', async () => {
        const queue = createQueue(3)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await removeCommand.execute({
            client: {} as any,
            interaction: makeInteraction(1),
        } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    embeds: expect.any(Array),
                }),
            }),
        )
    })

    it('shows track title and author in response', async () => {
        const queue = createQueue(3)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await removeCommand.execute({
            client: {} as any,
            interaction: makeInteraction(2),
        } as any)

        expect(createSuccessEmbedMock).toHaveBeenCalledWith(
            'Song removed',
            expect.stringContaining('Track 2'),
        )
    })
})
