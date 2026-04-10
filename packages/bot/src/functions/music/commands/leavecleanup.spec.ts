import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import leavecleanupCommand from './leavecleanup'

const requireGuildMock = jest.fn()
const requireQueueMock = jest.fn()
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

function createInteraction(guildId = 'guild-1') {
    return {
        guildId,
    } as any
}

function createQueue(tracks: any[] = []) {
    return {
        channel: {
            members: new Map([
                ['user-1', {}],
                ['user-2', {}],
            ]),
        },
        tracks: {
            toArray: jest.fn().mockReturnValue(tracks),
        },
        node: {
            remove: jest.fn(),
        },
    } as any
}

function createTrack(id: string, requesterId?: string) {
    return {
        id,
        title: `Track ${id}`,
        author: 'Artist',
        requestedBy: requesterId ? { id: requesterId } : null,
        url: `http://example.com/${id}`,
    } as any
}

describe('leavecleanup command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireGuildMock.mockResolvedValue(true)
        requireQueueMock.mockResolvedValue(true)
    })

    it('returns early when guild validation fails', async () => {
        requireGuildMock.mockResolvedValue(false)
        const queue = createQueue()
        resolveGuildQueueMock.mockReturnValue({ queue })

        await leavecleanupCommand.execute({ client: {} as any, interaction: createInteraction() } as any)

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('returns early when queue validation fails', async () => {
        requireQueueMock.mockResolvedValue(false)
        const queue = createQueue()
        resolveGuildQueueMock.mockReturnValue({ queue })

        await leavecleanupCommand.execute({ client: {} as any, interaction: createInteraction() } as any)

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('removes tracks from members who left the voice channel', async () => {
        const tracks = [
            createTrack('1', 'user-1'),
            createTrack('2', 'user-3'),
            createTrack('3', 'user-1'),
            createTrack('4', 'user-5'),
        ]
        const queue = createQueue(tracks)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await leavecleanupCommand.execute({ client: {} as any, interaction: createInteraction() } as any)

        expect(queue.node.remove).toHaveBeenCalledTimes(2)
        expect(createSuccessEmbedMock).toHaveBeenCalledWith('Queue cleaned up', expect.stringContaining('Removed 2 tracks'))
    })

    it('shows message when no tracks need to be removed', async () => {
        const tracks = [
            createTrack('1', 'user-1'),
            createTrack('2', 'user-2'),
        ]
        const queue = createQueue(tracks)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await leavecleanupCommand.execute({ client: {} as any, interaction: createInteraction() } as any)

        expect(queue.node.remove).not.toHaveBeenCalled()
        expect(createSuccessEmbedMock).toHaveBeenCalledWith('Queue cleaned up', expect.stringContaining('all requesters are still in the channel'))
    })

    it('shows error message when bot is not in a voice channel', async () => {
        const queue = {
            channel: null,
            tracks: { toArray: jest.fn().mockReturnValue([]) },
            node: { remove: jest.fn() },
        } as any
        resolveGuildQueueMock.mockReturnValue({ queue })

        await leavecleanupCommand.execute({ client: {} as any, interaction: createInteraction() } as any)

        expect(createErrorEmbedMock).toHaveBeenCalledWith('Error', expect.stringContaining('not in a voice channel'))
    })
})
