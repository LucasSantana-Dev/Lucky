import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import moveCommand from './move'

const requireGuildMock = jest.fn()
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

function createInteraction(from: number, to: number, guildId = 'guild-1') {
    return {
        guildId,
        user: { id: 'user-1' },
        options: {
            getInteger: jest.fn((name: string) => {
                if (name === 'from') return from
                if (name === 'to') return to
            }),
        },
    } as any
}

function createTrack(position: number) {
    return {
        id: `track-${position}`,
        title: `Song ${position}`,
        author: `Artist ${position}`,
        url: `https://example.com/track-${position}`,
    }
}

function createQueue(trackCount = 10) {
    const tracks = Array.from({ length: trackCount }, (_, i) =>
        createTrack(i + 1),
    )
    return {
        guild: { id: 'guild-1' },
        tracks: {
            size: trackCount,
            toArray: jest.fn().mockReturnValue([...tracks]),
            clear: jest.fn(),
            add: jest.fn(),
        },
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

describe('move command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireGuildMock.mockResolvedValue(true)
        requireQueueMock.mockResolvedValue(true)
        requireCurrentTrackMock.mockResolvedValue(true)
    })

    it('moves track from position 3 to position 1', async () => {
        const queue = createQueue(5)
        const client = createClient()
        const interaction = createInteraction(3, 1)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await moveCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.tracks.clear).toHaveBeenCalled()
        expect(queue.tracks.add).toHaveBeenCalled()
        const addedTracks = (queue.tracks.add as jest.Mock).mock.calls[0][0]
        expect(addedTracks[0].title).toBe('Song 3')
        expect(addedTracks[1].title).toBe('Song 1')
        expect(createSuccessEmbedMock).toHaveBeenCalledWith(
            'Song moved',
            expect.stringContaining('Song 3'),
        )
    })

    it('moves track from last position to first position', async () => {
        const queue = createQueue(5)
        const client = createClient()
        const interaction = createInteraction(5, 1)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await moveCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.tracks.clear).toHaveBeenCalled()
        const addedTracks = (queue.tracks.add as jest.Mock).mock.calls[0][0]
        expect(addedTracks[0].title).toBe('Song 5')
        expect(addedTracks[1].title).toBe('Song 1')
    })

    it('moves track from first position to last position', async () => {
        const queue = createQueue(5)
        const client = createClient()
        const interaction = createInteraction(1, 5)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await moveCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.tracks.clear).toHaveBeenCalled()
        const addedTracks = (queue.tracks.add as jest.Mock).mock.calls[0][0]
        expect(addedTracks[4].title).toBe('Song 1')
    })

    it('shows error when from position is out of range', async () => {
        const queue = createQueue(5)
        const client = createClient()
        const interaction = createInteraction(10, 1)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await moveCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.tracks.clear).not.toHaveBeenCalled()
        expect(createErrorEmbedMock).toHaveBeenCalledWith(
            'Error',
            'Invalid position!',
        )
    })

    it('shows error when to position is out of range', async () => {
        const queue = createQueue(5)
        const client = createClient()
        const interaction = createInteraction(1, 10)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await moveCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.tracks.clear).not.toHaveBeenCalled()
        expect(createErrorEmbedMock).toHaveBeenCalledWith(
            'Error',
            'Invalid position!',
        )
    })

    it('shows error when from position is negative', async () => {
        const queue = createQueue(5)
        const client = createClient()
        const interaction = createInteraction(-1, 1)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await moveCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.tracks.clear).not.toHaveBeenCalled()
        expect(createErrorEmbedMock).toHaveBeenCalledWith(
            'Error',
            'Invalid position!',
        )
    })

    it('shows error when queue is empty', async () => {
        const queue = createQueue(0)
        const client = createClient()
        const interaction = createInteraction(1, 1)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await moveCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.tracks.clear).not.toHaveBeenCalled()
        expect(createErrorEmbedMock).toHaveBeenCalledWith(
            'Error',
            'The queue is empty!',
        )
    })

    it('returns early when guild validation fails', async () => {
        requireGuildMock.mockResolvedValue(false)
        const queue = createQueue(5)
        const client = createClient()
        const interaction = createInteraction(2, 1)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await moveCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.tracks.clear).not.toHaveBeenCalled()
        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('returns early when queue validation fails', async () => {
        requireQueueMock.mockResolvedValue(false)
        const queue = createQueue(5)
        const client = createClient()
        const interaction = createInteraction(2, 1)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await moveCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.tracks.clear).not.toHaveBeenCalled()
        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('returns early when current track validation fails', async () => {
        requireCurrentTrackMock.mockResolvedValue(false)
        const queue = createQueue(5)
        const client = createClient()
        const interaction = createInteraction(2, 1)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await moveCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.tracks.clear).not.toHaveBeenCalled()
        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('handles moving track within same position (no-op)', async () => {
        const queue = createQueue(5)
        const client = createClient()
        const interaction = createInteraction(2, 2)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await moveCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.tracks.clear).toHaveBeenCalled()
        const addedTracks = (queue.tracks.add as jest.Mock).mock.calls[0][0]
        expect(addedTracks[1].title).toBe('Song 2')
    })
})
