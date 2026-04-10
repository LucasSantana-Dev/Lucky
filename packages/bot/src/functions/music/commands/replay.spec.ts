import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import replayCommand from './replay'

const requireQueueMock = jest.fn()
const requireCurrentTrackMock = jest.fn()
const requireIsPlayingMock = jest.fn()
const requireVoiceChannelMock = jest.fn()
const interactionReplyMock = jest.fn()
const createSuccessEmbedMock = jest.fn((title: string, desc?: string) => ({ title, description: desc }))
const buildCommandTrackEmbedMock = jest.fn(() => ({}))
const resolveGuildQueueMock = jest.fn()

jest.mock('../../../utils/command/commandValidations', () => ({
    requireQueue: (...args: unknown[]) => requireQueueMock(...args),
    requireCurrentTrack: (...args: unknown[]) => requireCurrentTrackMock(...args),
    requireIsPlaying: (...args: unknown[]) => requireIsPlayingMock(...args),
    requireVoiceChannel: (...args: unknown[]) => requireVoiceChannelMock(...args),
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createSuccessEmbed: (...args: unknown[]) => createSuccessEmbedMock(...args),
}))

jest.mock('../../../utils/general/responseEmbeds', () => ({
    buildCommandTrackEmbed: (...args: unknown[]) => buildCommandTrackEmbedMock(...args),
}))

jest.mock('../../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

function createInteraction(guildId = 'guild-1') {
    return {
        guildId,
        user: { username: 'tester', displayAvatarURL: jest.fn().mockReturnValue('http://avatar') },
    } as any
}

function createQueue(currentTrack: unknown = null) {
    return {
        node: {
            seek: jest.fn(),
        },
        currentTrack,
    } as any
}

function createClient() {
    return {} as any
}

describe('replay command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireVoiceChannelMock.mockResolvedValue(true)
        requireQueueMock.mockResolvedValue(true)
        requireCurrentTrackMock.mockResolvedValue(true)
        requireIsPlayingMock.mockResolvedValue(true)
        buildCommandTrackEmbedMock.mockReturnValue({})
    })

    it('returns early when voice channel validation fails', async () => {
        requireVoiceChannelMock.mockResolvedValue(false)
        const queue = createQueue()
        resolveGuildQueueMock.mockReturnValue({ queue })

        await replayCommand.execute({ client: createClient(), interaction: createInteraction() } as any)

        expect(queue.node.seek).not.toHaveBeenCalled()
    })

    it('returns early when queue validation fails', async () => {
        requireQueueMock.mockResolvedValue(false)
        const queue = createQueue()
        resolveGuildQueueMock.mockReturnValue({ queue })

        await replayCommand.execute({ client: createClient(), interaction: createInteraction() } as any)

        expect(queue.node.seek).not.toHaveBeenCalled()
    })

    it('seeks to beginning with current track', async () => {
        const currentTrack = { id: 'track-1', title: 'Test Song' }
        const queue = createQueue(currentTrack)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await replayCommand.execute({ client: createClient(), interaction: createInteraction() } as any)

        expect(queue.node.seek).toHaveBeenCalledWith(0)
        expect(buildCommandTrackEmbedMock).toHaveBeenCalledWith(currentTrack, '🔄 Replayed', expect.any(Object))
    })

    it('seeks to beginning with no current track', async () => {
        const queue = createQueue(null)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await replayCommand.execute({ client: createClient(), interaction: createInteraction() } as any)

        expect(queue.node.seek).toHaveBeenCalledWith(0)
        expect(createSuccessEmbedMock).toHaveBeenCalledWith('🔄 Replayed', 'Track has been replayed from the beginning.')
    })
})
