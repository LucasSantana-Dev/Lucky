import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import replayCommand from './replay'

const requireVoiceChannelMock = jest.fn()
const requireDJRoleMock = jest.fn()
const requireQueueMock = jest.fn()
const requireCurrentTrackMock = jest.fn()
const requireIsPlayingMock = jest.fn()
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
    requireDJRole: (...args: unknown[]) => requireDJRoleMock(...args),
    requireQueue: (...args: unknown[]) => requireQueueMock(...args),
    requireCurrentTrack: (...args: unknown[]) =>
        requireCurrentTrackMock(...args),
    requireIsPlaying: (...args: unknown[]) => requireIsPlayingMock(...args),
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

function createQueue() {
    return {
        node: {
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

describe('replay command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireVoiceChannelMock.mockResolvedValue(true)
        requireDJRoleMock.mockResolvedValue(true)
        requireQueueMock.mockResolvedValue(true)
        requireCurrentTrackMock.mockResolvedValue(true)
        requireIsPlayingMock.mockResolvedValue(true)
    })

    it('has correct command name', () => {
        expect(replayCommand.data.name).toBe('replay')
    })

    it('returns early when voice channel validation fails', async () => {
        requireVoiceChannelMock.mockResolvedValue(false)
        resolveGuildQueueMock.mockReturnValue({ queue: createQueue() })

        await replayCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('returns early when DJ role validation fails', async () => {
        requireDJRoleMock.mockResolvedValue(false)
        resolveGuildQueueMock.mockReturnValue({ queue: createQueue() })

        await replayCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('returns early when queue validation fails', async () => {
        requireQueueMock.mockResolvedValue(false)
        resolveGuildQueueMock.mockReturnValue({ queue: createQueue() })

        await replayCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('returns early when no current track', async () => {
        requireCurrentTrackMock.mockResolvedValue(false)
        resolveGuildQueueMock.mockReturnValue({ queue: createQueue() })

        await replayCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('returns early when music is not playing', async () => {
        requireIsPlayingMock.mockResolvedValue(false)
        resolveGuildQueueMock.mockReturnValue({ queue: createQueue() })

        await replayCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('seeks to beginning of track', async () => {
        const queue = createQueue()
        resolveGuildQueueMock.mockReturnValue({ queue })

        await replayCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(queue.node.seek).toHaveBeenCalledWith(0)
    })

    it('replies with track embed when current track exists', async () => {
        const queue = createQueue()
        resolveGuildQueueMock.mockReturnValue({ queue })

        await replayCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(buildCommandTrackEmbedMock).toHaveBeenCalledWith(
            expect.any(Object),
            expect.stringContaining('Replayed'),
            expect.any(Object),
        )
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    embeds: expect.any(Array),
                }),
            }),
        )
    })

    it('replies with success embed when no current track but all validations passed', async () => {
        const queue = createQueue()
        queue.currentTrack = null
        resolveGuildQueueMock.mockReturnValue({ queue })

        await replayCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(createSuccessEmbedMock).toHaveBeenCalledWith(
            '🔄 Replayed',
            expect.stringContaining('replayed'),
        )
    })

    it('validates all permission checks before seeking', async () => {
        const queue = createQueue()
        resolveGuildQueueMock.mockReturnValue({ queue })
        const callOrder: string[] = []

        requireVoiceChannelMock.mockImplementation(async () => {
            callOrder.push('voice')
            return true
        })
        requireDJRoleMock.mockImplementation(async () => {
            callOrder.push('dj')
            return true
        })
        queue.node.seek.mockImplementation(() => callOrder.push('seek'))

        await replayCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(callOrder[0]).toBe('voice')
        expect(callOrder[1]).toBe('dj')
        expect(callOrder).toContain('seek')
    })
})
