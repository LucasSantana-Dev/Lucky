import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import skiptoCommand from './skipto'

const requireQueueMock = jest.fn()
const requireVoiceChannelMock = jest.fn()
const interactionReplyMock = jest.fn()
const createErrorEmbedMock = jest.fn((title: string, desc?: string) => ({ title, description: desc }))
const createSuccessEmbedMock = jest.fn((title: string, desc?: string) => ({ title, description: desc }))
const buildCommandTrackEmbedMock = jest.fn(() => ({}))
const resolveGuildQueueMock = jest.fn()

jest.mock('../../../utils/command/commandValidations', () => ({
    requireQueue: (...args: unknown[]) => requireQueueMock(...args),
    requireVoiceChannel: (...args: unknown[]) => requireVoiceChannelMock(...args),
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createErrorEmbed: (...args: unknown[]) => createErrorEmbedMock(...args),
    createSuccessEmbed: (...args: unknown[]) => createSuccessEmbedMock(...args),
}))

jest.mock('../../../utils/general/responseEmbeds', () => ({
    buildCommandTrackEmbed: (...args: unknown[]) => buildCommandTrackEmbedMock(...args),
}))

jest.mock('../../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

function createInteraction(guildId = 'guild-1', position = 2) {
    return {
        guildId,
        user: { username: 'tester', displayAvatarURL: jest.fn().mockReturnValue('http://avatar') },
        options: {
            getInteger: jest.fn().mockReturnValue(position),
        },
    } as any
}

function createQueue(tracks: unknown[] = []) {
    return {
        node: {
            skipTo: jest.fn(),
        },
        tracks: {
            size: tracks.length,
            toArray: jest.fn().mockReturnValue(tracks),
        },
    } as any
}

function createClient() {
    return {} as any
}

describe('skipto command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireVoiceChannelMock.mockResolvedValue(true)
        requireQueueMock.mockResolvedValue(true)
        buildCommandTrackEmbedMock.mockReturnValue({})
    })

    it('returns early when voice channel validation fails', async () => {
        requireVoiceChannelMock.mockResolvedValue(false)
        const queue = createQueue([{ id: 'track-1' }])
        resolveGuildQueueMock.mockReturnValue({ queue })

        await skiptoCommand.execute({ client: createClient(), interaction: createInteraction() } as any)

        expect(queue.node.skipTo).not.toHaveBeenCalled()
    })

    it('skips to specified position', async () => {
        const tracks = [
            { id: 'track-1', title: 'Song 1' },
            { id: 'track-2', title: 'Song 2' },
            { id: 'track-3', title: 'Song 3' },
        ]
        const queue = createQueue(tracks)
        resolveGuildQueueMock.mockReturnValue({ queue })

        const interaction = createInteraction('guild-1', 2)
        await skiptoCommand.execute({ client: createClient(), interaction } as any)

        expect(queue.node.skipTo).toHaveBeenCalledWith(1)
        expect(buildCommandTrackEmbedMock).toHaveBeenCalledWith(tracks[1], '⏭️ Now playing (position 2)', expect.any(Object))
    })

    it('shows error when position exceeds queue size', async () => {
        const tracks = [
            { id: 'track-1', title: 'Song 1' },
            { id: 'track-2', title: 'Song 2' },
        ]
        const queue = createQueue(tracks)
        resolveGuildQueueMock.mockReturnValue({ queue })

        const interaction = createInteraction('guild-1', 5)
        await skiptoCommand.execute({ client: createClient(), interaction } as any)

        expect(queue.node.skipTo).not.toHaveBeenCalled()
        expect(createErrorEmbedMock).toHaveBeenCalledWith('Invalid position', expect.any(String))
    })

    it('accepts position 1 for first track in queue', async () => {
        const tracks = [
            { id: 'track-1', title: 'Song 1' },
            { id: 'track-2', title: 'Song 2' },
        ]
        const queue = createQueue(tracks)
        resolveGuildQueueMock.mockReturnValue({ queue })

        const interaction = createInteraction('guild-1', 1)
        await skiptoCommand.execute({ client: createClient(), interaction } as any)

        expect(queue.node.skipTo).toHaveBeenCalledWith(0)
    })
})
