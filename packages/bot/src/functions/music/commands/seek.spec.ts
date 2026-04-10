import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import seekCommand from './seek'

const requireQueueMock = jest.fn()
const requireDJRoleMock = jest.fn()
const requireCurrentTrackMock = jest.fn()
const requireIsPlayingMock = jest.fn()
const requireVoiceChannelMock = jest.fn()
const interactionReplyMock = jest.fn()
const createErrorEmbedMock = jest.fn((title: string, desc?: string) => ({ title, description: desc }))
const createSuccessEmbedMock = jest.fn((title: string, desc?: string) => ({ title, description: desc }))
const buildCommandTrackEmbedMock = jest.fn(() => ({}))
const resolveGuildQueueMock = jest.fn()

jest.mock('../../../utils/command/commandValidations', () => ({
    requireQueue: (...args: unknown[]) => requireQueueMock(...args),
    requireCurrentTrack: (...args: unknown[]) => requireCurrentTrackMock(...args),
    requireIsPlaying: (...args: unknown[]) => requireIsPlayingMock(...args),
    requireVoiceChannel: (...args: unknown[]) => requireVoiceChannelMock(...args),
    requireDJRole: (...args: unknown[]) => requireDJRoleMock(...args)
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

function createInteraction(guildId = 'guild-1', timeStr = '1:30') {
    return {
        guildId,
        user: { username: 'tester', displayAvatarURL: jest.fn().mockReturnValue('http://avatar') },
        options: {
            getString: jest.fn().mockReturnValue(timeStr),
        },
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

describe('seek command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireVoiceChannelMock.mockResolvedValue(true)
        requireDJRoleMock.mockResolvedValue(true)
        requireQueueMock.mockResolvedValue(true)
        requireCurrentTrackMock.mockResolvedValue(true)
        requireIsPlayingMock.mockResolvedValue(true)
        buildCommandTrackEmbedMock.mockReturnValue({})
    })

    it('returns early when voice channel validation fails', async () => {
        requireVoiceChannelMock.mockResolvedValue(false)
        const queue = createQueue()
        resolveGuildQueueMock.mockReturnValue({ queue })

        await seekCommand.execute({ client: createClient(), interaction: createInteraction() } as any)

        expect(queue.node.seek).not.toHaveBeenCalled()
    })

    it('seeks to time in mm:ss format', async () => {
        const currentTrack = { id: 'track-1', title: 'Test Song', durationMS: 300000 }
        const queue = createQueue(currentTrack)
        resolveGuildQueueMock.mockReturnValue({ queue })

        const interaction = createInteraction('guild-1', '1:30')
        await seekCommand.execute({ client: createClient(), interaction } as any)

        expect(queue.node.seek).toHaveBeenCalledWith(90000)
    })

    it('seeks to time in ss format', async () => {
        const currentTrack = { id: 'track-1', title: 'Test Song', durationMS: 300000 }
        const queue = createQueue(currentTrack)
        resolveGuildQueueMock.mockReturnValue({ queue })

        const interaction = createInteraction('guild-1', '45')
        await seekCommand.execute({ client: createClient(), interaction } as any)

        expect(queue.node.seek).toHaveBeenCalledWith(45000)
    })

    it('shows error for invalid time format', async () => {
        const currentTrack = { id: 'track-1', title: 'Test Song', durationMS: 300000 }
        const queue = createQueue(currentTrack)
        resolveGuildQueueMock.mockReturnValue({ queue })

        const interaction = createInteraction('guild-1', 'invalid')
        await seekCommand.execute({ client: createClient(), interaction } as any)

        expect(queue.node.seek).not.toHaveBeenCalled()
        expect(createErrorEmbedMock).toHaveBeenCalledWith('Invalid time format', expect.any(String))
    })

    it('shows error when seek time exceeds track duration', async () => {
        const currentTrack = { id: 'track-1', title: 'Test Song', durationMS: 60000 }
        const queue = createQueue(currentTrack)
        resolveGuildQueueMock.mockReturnValue({ queue })

        const interaction = createInteraction('guild-1', '2:30')
        await seekCommand.execute({ client: createClient(), interaction } as any)

        expect(queue.node.seek).not.toHaveBeenCalled()
        expect(createErrorEmbedMock).toHaveBeenCalledWith('Time out of range', expect.any(String))
    })

    it('shows error when track does not support seeking', async () => {
        const currentTrack = { id: 'track-1', title: 'Live Stream', durationMS: null }
        const queue = createQueue(currentTrack)
        resolveGuildQueueMock.mockReturnValue({ queue })

        const interaction = createInteraction('guild-1', '1:30')
        await seekCommand.execute({ client: createClient(), interaction } as any)

        expect(queue.node.seek).not.toHaveBeenCalled()
        expect(createErrorEmbedMock).toHaveBeenCalledWith('Cannot seek', expect.any(String))
    })
})
