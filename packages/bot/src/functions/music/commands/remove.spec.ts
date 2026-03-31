import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import removeCommand from './remove'

const requireGuildMock = jest.fn()
const requireQueueMock = jest.fn()
const requireCurrentTrackMock = jest.fn()
const requireVoiceChannelMock = jest.fn()
const interactionReplyMock = jest.fn()
const successEmbedMock = jest.fn((title: string, desc?: string) => ({
    title,
    description: desc,
}))
const errorEmbedMock = jest.fn((title: string, desc?: string) => ({
    title,
    description: desc,
}))
const resolveGuildQueueMock = jest.fn()

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: (...args: unknown[]) => requireGuildMock(...args),
    requireQueue: (...args: unknown[]) => requireQueueMock(...args),
    requireCurrentTrack: (...args: unknown[]) =>
        requireCurrentTrackMock(...args),
    requireVoiceChannel: (...args: unknown[]) =>
        requireVoiceChannelMock(...args),
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/general/embeds', () => ({
    successEmbed: (...args: unknown[]) => successEmbedMock(...args),
    errorEmbed: (...args: unknown[]) => errorEmbedMock(...args),
}))

jest.mock('../../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

function createInteraction(position: number, guildId = 'guild-1') {
    return {
        guildId,
        user: { id: 'user-1' },
        options: {
            getInteger: jest.fn(() => position),
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
            remove: jest.fn(),
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

describe('remove command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireGuildMock.mockResolvedValue(true)
        requireQueueMock.mockResolvedValue(true)
        requireCurrentTrackMock.mockResolvedValue(true)
        requireVoiceChannelMock.mockResolvedValue(true)
    })

    it('removes track at specified position', async () => {
        const queue = createQueue(5)
        const client = createClient()
        const interaction = createInteraction(2)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await removeCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.tracks.remove).toHaveBeenCalled()
        expect(successEmbedMock).toHaveBeenCalledWith(
            'Song removed',
            expect.stringContaining('Song 2'),
        )
    })

    it('removes first track from queue', async () => {
        const queue = createQueue(5)
        const client = createClient()
        const interaction = createInteraction(1)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await removeCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.tracks.remove).toHaveBeenCalled()
        expect(successEmbedMock).toHaveBeenCalledWith(
            'Song removed',
            expect.stringContaining('Song 1'),
        )
    })

    it('removes last track from queue', async () => {
        const queue = createQueue(5)
        const client = createClient()
        const interaction = createInteraction(5)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await removeCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.tracks.remove).toHaveBeenCalled()
        expect(successEmbedMock).toHaveBeenCalledWith(
            'Song removed',
            expect.stringContaining('Song 5'),
        )
    })

    it('shows error when position is out of range (too high)', async () => {
        const queue = createQueue(5)
        const client = createClient()
        const interaction = createInteraction(10)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await removeCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.tracks.remove).not.toHaveBeenCalled()
        expect(errorEmbedMock).toHaveBeenCalledWith(
            'Error',
            'Invalid position!',
        )
    })

    it('shows error when position is negative', async () => {
        const queue = createQueue(5)
        const client = createClient()
        const interaction = createInteraction(-1)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await removeCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.tracks.remove).not.toHaveBeenCalled()
        expect(errorEmbedMock).toHaveBeenCalledWith(
            'Error',
            'Invalid position!',
        )
    })

    it('shows error when queue is empty', async () => {
        const queue = createQueue(0)
        const client = createClient()
        const interaction = createInteraction(1)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await removeCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.tracks.remove).not.toHaveBeenCalled()
        expect(errorEmbedMock).toHaveBeenCalledWith(
            'Error',
            'The queue is empty!',
        )
    })

    it('returns early when guild validation fails', async () => {
        requireGuildMock.mockResolvedValue(false)
        const queue = createQueue(5)
        const client = createClient()
        const interaction = createInteraction(2)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await removeCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.tracks.remove).not.toHaveBeenCalled()
        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('returns early when voice channel validation fails', async () => {
        requireVoiceChannelMock.mockResolvedValue(false)
        const queue = createQueue(5)
        const client = createClient()
        const interaction = createInteraction(2)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await removeCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.tracks.remove).not.toHaveBeenCalled()
        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('returns early when queue validation fails', async () => {
        requireQueueMock.mockResolvedValue(false)
        const queue = createQueue(5)
        const client = createClient()
        const interaction = createInteraction(2)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await removeCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.tracks.remove).not.toHaveBeenCalled()
        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('returns early when current track validation fails', async () => {
        requireCurrentTrackMock.mockResolvedValue(false)
        const queue = createQueue(5)
        const client = createClient()
        const interaction = createInteraction(2)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await removeCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.tracks.remove).not.toHaveBeenCalled()
        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('removes from large queue', async () => {
        const queue = createQueue(100)
        const client = createClient()
        const interaction = createInteraction(50)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await removeCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.tracks.remove).toHaveBeenCalled()
        expect(successEmbedMock).toHaveBeenCalledWith(
            'Song removed',
            expect.stringContaining('Song 50'),
        )
    })
})
