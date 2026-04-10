import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import pauseCommand from './pause'

const requireQueueMock = jest.fn()
const requireVoiceChannelMock = jest.fn()
const interactionReplyMock = jest.fn()
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

function createQueue(isPaused = false, currentTrack: unknown = null) {
    return {
        node: {
            isPaused: jest.fn().mockReturnValue(isPaused),
            pause: jest.fn(),
            resume: jest.fn(),
        },
        currentTrack,
    } as any
}

function createClient() {
    return {} as any
}

describe('pause command (toggle)', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireVoiceChannelMock.mockResolvedValue(true)
        requireQueueMock.mockResolvedValue(true)
        buildCommandTrackEmbedMock.mockReturnValue({})
    })

    it('returns early when voice channel validation fails', async () => {
        requireVoiceChannelMock.mockResolvedValue(false)
        const queue = createQueue()
        resolveGuildQueueMock.mockReturnValue({ queue })

        await pauseCommand.execute({ client: createClient(), interaction: createInteraction() } as any)

        expect(queue.node.pause).not.toHaveBeenCalled()
        expect(queue.node.resume).not.toHaveBeenCalled()
    })

    it('returns early when queue validation fails', async () => {
        requireQueueMock.mockResolvedValue(false)
        const queue = createQueue()
        resolveGuildQueueMock.mockReturnValue({ queue })

        await pauseCommand.execute({ client: createClient(), interaction: createInteraction() } as any)

        expect(queue.node.pause).not.toHaveBeenCalled()
        expect(queue.node.resume).not.toHaveBeenCalled()
    })

    it('resumes when currently paused with no track', async () => {
        const queue = createQueue(true, null)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await pauseCommand.execute({ client: createClient(), interaction: createInteraction() } as any)

        expect(queue.node.resume).toHaveBeenCalled()
        expect(queue.node.pause).not.toHaveBeenCalled()
        expect(createSuccessEmbedMock).toHaveBeenCalledWith('▶️ Resumed', 'Music has been resumed.')
    })

    it('pauses when currently playing with no track', async () => {
        const queue = createQueue(false, null)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await pauseCommand.execute({ client: createClient(), interaction: createInteraction() } as any)

        expect(queue.node.pause).toHaveBeenCalled()
        expect(queue.node.resume).not.toHaveBeenCalled()
        expect(createSuccessEmbedMock).toHaveBeenCalledWith('⏸️ Paused', 'Music has been paused.')
    })

    it('resumes when currently paused with current track', async () => {
        const currentTrack = { id: 'track-1', title: 'Test Song' }
        const queue = createQueue(true, currentTrack)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await pauseCommand.execute({ client: createClient(), interaction: createInteraction() } as any)

        expect(queue.node.resume).toHaveBeenCalled()
        expect(queue.node.pause).not.toHaveBeenCalled()
        expect(buildCommandTrackEmbedMock).toHaveBeenCalledWith(currentTrack, '▶️ Resumed', expect.any(Object))
    })

    it('pauses when currently playing with current track', async () => {
        const currentTrack = { id: 'track-1', title: 'Test Song' }
        const queue = createQueue(false, currentTrack)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await pauseCommand.execute({ client: createClient(), interaction: createInteraction() } as any)

        expect(queue.node.pause).toHaveBeenCalled()
        expect(queue.node.resume).not.toHaveBeenCalled()
        expect(buildCommandTrackEmbedMock).toHaveBeenCalledWith(currentTrack, '⏸️ Paused', expect.any(Object))
    })
})
