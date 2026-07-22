import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import pauseCommand from './pause'

const requireVoiceChannelMock = jest.fn()
const requireQueueMock = jest.fn()
const interactionReplyMock = jest.fn()
const createSuccessEmbedMock = jest.fn((title: string, desc?: string) => ({
    title,
    description: desc,
}))
const buildCommandTrackEmbedMock = jest.fn((track: any, action: string) => ({
    action,
    track: track?.title,
}))
const resolveGuildQueueMock = jest.fn()

jest.mock('../../../utils/command/commandValidations', () => ({
    requireVoiceChannel: (...args: unknown[]) =>
        requireVoiceChannelMock(...args),
    requireQueue: (...args: unknown[]) => requireQueueMock(...args),
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createSuccessEmbed: (...args: unknown[]) => createSuccessEmbedMock(...args),
}))

jest.mock('../../../utils/general/responseEmbeds', () => ({
    buildCommandTrackEmbed: (...args: unknown[]) =>
        buildCommandTrackEmbedMock(...args),
}))

jest.mock('../../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

function createQueue(isPaused = false) {
    return {
        node: {
            isPaused: jest.fn().mockReturnValue(isPaused),
            pause: jest.fn(),
            resume: jest.fn(),
            seek: jest.fn(),
        },
        currentTrack: { title: 'Test Song', author: 'Test Artist' },
    } as any
}

function makeInteraction() {
    return {
        guildId: 'guild-1',
        user: { tag: 'User#0001' },
    } as any
}

describe('pause command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireVoiceChannelMock.mockResolvedValue(true)
        requireQueueMock.mockResolvedValue(true)
    })

    it('has correct command name', () => {
        expect(pauseCommand.data.name).toBe('pause')
    })

    it('returns early when voice channel validation fails', async () => {
        requireVoiceChannelMock.mockResolvedValue(false)
        resolveGuildQueueMock.mockReturnValue({ queue: createQueue() })

        await pauseCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('returns early when queue validation fails', async () => {
        requireQueueMock.mockResolvedValue(false)
        resolveGuildQueueMock.mockReturnValue({ queue: createQueue() })

        await pauseCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('pauses music when currently playing', async () => {
        const queue = createQueue(false)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await pauseCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(queue.node.pause).toHaveBeenCalled()
        expect(queue.node.resume).not.toHaveBeenCalled()
    })

    it('resumes music when currently paused', async () => {
        const queue = createQueue(true)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await pauseCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(queue.node.resume).toHaveBeenCalled()
        expect(queue.node.pause).not.toHaveBeenCalled()
    })

    it('shows paused status when pausing', async () => {
        const queue = createQueue(false)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await pauseCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(buildCommandTrackEmbedMock).toHaveBeenCalledWith(
            expect.any(Object),
            expect.stringContaining('Paused'),
            expect.any(Object),
        )
    })

    it('shows resumed status when resuming', async () => {
        const queue = createQueue(true)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await pauseCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(buildCommandTrackEmbedMock).toHaveBeenCalledWith(
            expect.any(Object),
            expect.stringContaining('Resumed'),
            expect.any(Object),
        )
    })

    it('replies with track embed when current track exists', async () => {
        const queue = createQueue(false)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await pauseCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    embeds: expect.any(Array),
                }),
            }),
        )
    })

    it('replies with success embed when no current track', async () => {
        const queue = createQueue(false)
        queue.currentTrack = null
        resolveGuildQueueMock.mockReturnValue({ queue })

        await pauseCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(createSuccessEmbedMock).toHaveBeenCalledWith(
            '⏸️ Paused',
            expect.stringContaining('paused'),
        )
    })
})
