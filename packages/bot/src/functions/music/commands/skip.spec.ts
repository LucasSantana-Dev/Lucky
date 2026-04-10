import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import skipCommand from './skip'

const requireGuildMock = jest.fn()
const requireDJRoleMock = jest.fn()
const requireQueueMock = jest.fn()
const requireCurrentTrackMock = jest.fn()
const requireIsPlayingMock = jest.fn()
const interactionReplyMock = jest.fn()
const createSuccessEmbedMock = jest.fn((title: string, desc?: string) => ({
    title,
    description: desc,
}))
const createErrorEmbedMock = jest.fn((title: string, desc?: string) => ({
    title,
    description: desc,
}))
const buildCommandTrackEmbedMock = jest.fn(() => ({}))
const debugLogMock = jest.fn()
const errorLogMock = jest.fn()
const resolveGuildQueueMock = jest.fn()

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: (...args: unknown[]) => requireGuildMock(...args),
    requireQueue: (...args: unknown[]) => requireQueueMock(...args),
    requireCurrentTrack: (...args: unknown[]) =>
        requireCurrentTrackMock(...args),
    requireIsPlaying: (...args: unknown[]) => requireIsPlayingMock(...args),
    requireDJRole: (...args: unknown[]) => requireDJRoleMock(...args)
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createSuccessEmbed: (...args: unknown[]) => createSuccessEmbedMock(...args),
    createErrorEmbed: (...args: unknown[]) => createErrorEmbedMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('../../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

jest.mock('../../../utils/general/responseEmbeds', () => ({
    buildCommandTrackEmbed: (...args: unknown[]) => buildCommandTrackEmbedMock(...args),
}))

function createInteraction(guildId = 'guild-1') {
    return {
        guildId,
        user: { id: 'user-1' },
    } as any
}

function createQueue() {
    return {
        guild: { id: 'guild-1' },
        isPlaying: jest.fn().mockReturnValue(true),
        node: {
            skip: jest.fn(),
            play: jest.fn(),
        },
        tracks: {
            size: 5,
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

describe('skip command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        jest.useFakeTimers()
        requireGuildMock.mockResolvedValue(true)
        requireDJRoleMock.mockResolvedValue(true)
        requireQueueMock.mockResolvedValue(true)
        requireCurrentTrackMock.mockResolvedValue(true)
        requireIsPlayingMock.mockResolvedValue(true)
        buildCommandTrackEmbedMock.mockReturnValue({})
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    it('skips the current song and sends success response', async () => {
        const queue = createQueue()
        const client = createClient()
        const interaction = createInteraction()
        resolveGuildQueueMock.mockReturnValue({ queue })

        await skipCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.node.skip).toHaveBeenCalled()
        expect(debugLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('Skipped current song'),
            }),
        )
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                interaction,
            }),
        )
        expect(createSuccessEmbedMock).toHaveBeenCalledWith(
            '⏭️ Song skipped',
            'The current song has been skipped.',
        )
    })

    it('auto-plays after skip when queue has remaining tracks', async () => {
        const queue = createQueue()
        let isPlayingAfterSkip = true
        queue.isPlaying.mockImplementation(() => isPlayingAfterSkip)
        const client = createClient()
        const interaction = createInteraction()
        resolveGuildQueueMock.mockReturnValue({ queue })

        queue.node.skip.mockImplementation(() => {
            isPlayingAfterSkip = false
        })

        const executePromise = skipCommand.execute({
            client,
            interaction,
        } as any)

        await executePromise
        jest.advanceTimersByTime(500)
        await Promise.resolve()

        expect(queue.node.play).toHaveBeenCalled()
    })

    it('returns early when guild validation fails', async () => {
        requireGuildMock.mockResolvedValue(false)
        const queue = createQueue()
        const client = createClient()
        const interaction = createInteraction()
        resolveGuildQueueMock.mockReturnValue({ queue })

        await skipCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.node.skip).not.toHaveBeenCalled()
        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('returns early when queue validation fails', async () => {
        requireQueueMock.mockResolvedValue(false)
        const queue = createQueue()
        const client = createClient()
        const interaction = createInteraction()
        resolveGuildQueueMock.mockReturnValue({ queue })

        await skipCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.node.skip).not.toHaveBeenCalled()
        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('returns early when current track validation fails', async () => {
        requireCurrentTrackMock.mockResolvedValue(false)
        const queue = createQueue()
        const client = createClient()
        const interaction = createInteraction()
        resolveGuildQueueMock.mockReturnValue({ queue })

        await skipCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.node.skip).not.toHaveBeenCalled()
        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('returns early when is playing validation fails', async () => {
        requireIsPlayingMock.mockResolvedValue(false)
        const queue = createQueue()
        const client = createClient()
        const interaction = createInteraction()
        resolveGuildQueueMock.mockReturnValue({ queue })

        await skipCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.node.skip).not.toHaveBeenCalled()
        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('shows error when queue is not playing', async () => {
        requireIsPlayingMock.mockResolvedValue(true)
        const queue = createQueue()
        queue.isPlaying.mockReturnValue(false)
        const client = createClient()
        const interaction = createInteraction()
        resolveGuildQueueMock.mockReturnValue({ queue })

        await skipCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.node.skip).not.toHaveBeenCalled()
        expect(interactionReplyMock).toHaveBeenCalled()
        expect(createErrorEmbedMock).toHaveBeenCalledWith(
            'Error',
            "🤔 There's no music playing at the moment.",
        )
    })

    it('handles error thrown by discord-player gracefully', async () => {
        const queue = createQueue()
        const skipError = new Error('Discord player error')
        queue.node.skip.mockImplementation(() => {
            throw skipError
        })
        const client = createClient()
        const interaction = createInteraction()
        resolveGuildQueueMock.mockReturnValue({ queue })

        await skipCommand.execute({
            client,
            interaction,
        } as any)

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Error in skip command:',
                error: skipError,
            }),
        )
        expect(interactionReplyMock).toHaveBeenCalled()
        expect(createErrorEmbedMock).toHaveBeenCalledWith(
            'Error',
            'An error occurred while trying to skip the song.',
        )
    })

    it('does not auto-play when queue becomes empty after skip', async () => {
        const queue = createQueue()
        queue.isPlaying.mockReturnValue(false)
        queue.tracks.size = 0
        const client = createClient()
        const interaction = createInteraction()
        resolveGuildQueueMock.mockReturnValue({ queue })

        await skipCommand.execute({
            client,
            interaction,
        } as any)

        jest.advanceTimersByTime(500)
        await Promise.resolve()

        expect(queue.node.play).not.toHaveBeenCalled()
    })

    it('shows rich track embed for next track after skip', async () => {
        const nextTrack = { title: 'Next Song', author: 'Artist', url: 'http://x', duration: '3:00' }
        const queue = {
            ...createQueue(),
            currentTrack: nextTrack,
        }
        const client = createClient()
        const interaction = {
            ...createInteraction(),
            user: { username: 'tester', displayAvatarURL: jest.fn().mockReturnValue('http://avatar') },
        }
        resolveGuildQueueMock.mockReturnValue({ queue })

        await skipCommand.execute({ client, interaction } as any)

        expect(buildCommandTrackEmbedMock).toHaveBeenCalledWith(
            nextTrack,
            '⏭️ Song skipped - Now playing',
            expect.any(Object),
        )
        expect(interactionReplyMock).toHaveBeenCalled()
    })
})
