import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import shuffleCommand from './shuffle'

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
const smartShuffleMock = jest.fn()

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

jest.mock('../../../utils/music/queue/smartShuffle', () => ({
    smartShuffle: (...args: unknown[]) => smartShuffleMock(...args),
}))

function makeTrack(id: string) {
    return {
        id,
        title: `Song ${id}`,
        author: 'Artist',
        duration: '3:00',
        source: 'youtube',
        requestedBy: { id: 'user-1' },
    }
}

function makeQueue(trackCount = 5) {
    const tracks = Array.from({ length: trackCount }, (_, i) =>
        makeTrack(`t${i + 1}`),
    )
    return {
        tracks: {
            size: trackCount,
            toArray: jest.fn().mockReturnValue([...tracks]),
            shuffle: jest.fn(),
            clear: jest.fn(),
            add: jest.fn(),
        },
    }
}

function makeInteraction(subcommand: string | null = 'random', guildId = 'g1') {
    return {
        guildId,
        options: { getSubcommand: jest.fn().mockReturnValue(subcommand) },
    }
}

function makeClient() {
    return {}
}

describe('shuffle command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireGuildMock.mockResolvedValue(true)
        requireVoiceChannelMock.mockResolvedValue(true)
        requireQueueMock.mockResolvedValue(true)
        requireCurrentTrackMock.mockResolvedValue(true)
        interactionReplyMock.mockResolvedValue(undefined)
    })

    it('stops if requireGuild fails', async () => {
        requireGuildMock.mockResolvedValue(false)
        const interaction = makeInteraction()
        await shuffleCommand.execute({
            client: makeClient() as never,
            interaction: interaction as never,
        })
        expect(resolveGuildQueueMock).not.toHaveBeenCalled()
    })

    it('stops if requireVoiceChannel fails', async () => {
        requireVoiceChannelMock.mockResolvedValue(false)
        const queue = makeQueue()
        resolveGuildQueueMock.mockReturnValue({ queue })
        const interaction = makeInteraction()
        await shuffleCommand.execute({
            client: makeClient() as never,
            interaction: interaction as never,
        })
        expect(requireQueueMock).not.toHaveBeenCalled()
    })

    it('stops if requireQueue fails', async () => {
        requireQueueMock.mockResolvedValue(false)
        const queue = makeQueue()
        resolveGuildQueueMock.mockReturnValue({ queue })
        const interaction = makeInteraction()
        await shuffleCommand.execute({
            client: makeClient() as never,
            interaction: interaction as never,
        })
        expect(requireCurrentTrackMock).not.toHaveBeenCalled()
    })

    it('stops if requireCurrentTrack fails', async () => {
        requireCurrentTrackMock.mockResolvedValue(false)
        const queue = makeQueue()
        resolveGuildQueueMock.mockReturnValue({ queue })
        const interaction = makeInteraction()
        await shuffleCommand.execute({
            client: makeClient() as never,
            interaction: interaction as never,
        })
        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('replies with error when queue has fewer than 2 tracks', async () => {
        const queue = makeQueue(1)
        resolveGuildQueueMock.mockReturnValue({ queue })
        const interaction = makeInteraction()
        await shuffleCommand.execute({
            client: makeClient() as never,
            interaction: interaction as never,
        })
        expect(createErrorEmbedMock).toHaveBeenCalled()
        expect(queue.tracks.shuffle).not.toHaveBeenCalled()
    })

    it('calls queue.tracks.shuffle() for random subcommand', async () => {
        const queue = makeQueue(5)
        resolveGuildQueueMock.mockReturnValue({ queue })
        const interaction = makeInteraction('random')
        await shuffleCommand.execute({
            client: makeClient() as never,
            interaction: interaction as never,
        })
        expect(queue.tracks.shuffle).toHaveBeenCalled()
        expect(createSuccessEmbedMock).toHaveBeenCalledWith(
            'Queue shuffled',
            expect.stringContaining('shuffled successfully'),
        )
    })

    it('defaults to random when subcommand is null', async () => {
        const queue = makeQueue(5)
        resolveGuildQueueMock.mockReturnValue({ queue })
        const interaction = makeInteraction(null)
        await shuffleCommand.execute({
            client: makeClient() as never,
            interaction: interaction as never,
        })
        expect(queue.tracks.shuffle).toHaveBeenCalled()
    })

    it('calls smartShuffle and replaces tracks for smart subcommand', async () => {
        const originalTracks = Array.from({ length: 4 }, (_, i) =>
            makeTrack(`t${i + 1}`),
        )
        const shuffledTracks = [...originalTracks].reverse()
        const queue = makeQueue(4)
        queue.tracks.toArray = jest.fn().mockReturnValue(originalTracks)
        smartShuffleMock.mockReturnValue(shuffledTracks)
        resolveGuildQueueMock.mockReturnValue({ queue })
        const interaction = makeInteraction('smart')
        await shuffleCommand.execute({
            client: makeClient() as never,
            interaction: interaction as never,
        })
        expect(smartShuffleMock).toHaveBeenCalledWith(
            originalTracks,
            expect.objectContaining({ streakLimit: expect.any(Number) }),
        )
        expect(queue.tracks.clear).toHaveBeenCalled()
        expect(queue.tracks.add).toHaveBeenCalledTimes(shuffledTracks.length)
        expect(createSuccessEmbedMock).toHaveBeenCalledWith(
            'Queue smart-shuffled',
            expect.stringContaining('smart-shuffled'),
        )
    })

    it('smart shuffle adds each shuffled track to the queue', async () => {
        const tracks = [makeTrack('a'), makeTrack('b'), makeTrack('c')]
        const queue = makeQueue(3)
        queue.tracks.toArray = jest.fn().mockReturnValue(tracks)
        smartShuffleMock.mockReturnValue(tracks)
        resolveGuildQueueMock.mockReturnValue({ queue })
        const interaction = makeInteraction('smart')
        await shuffleCommand.execute({
            client: makeClient() as never,
            interaction: interaction as never,
        })
        tracks.forEach((t) => expect(queue.tracks.add).toHaveBeenCalledWith(t))
    })
})
