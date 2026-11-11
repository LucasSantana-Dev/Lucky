import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import skipCommand from './skip'

const requireGuildMock = jest.fn()
const requireDJRoleMock = jest.fn()
const requireQueueMock = jest.fn()
const requireCurrentTrackMock = jest.fn()
const requireIsPlayingMock = jest.fn()
const interactionReplyMock = jest.fn()
const createErrorEmbedMock = jest.fn()
const createSuccessEmbedMock = jest.fn()
const buildCommandTrackEmbedMock = jest.fn()
const resolveGuildQueueMock = jest.fn()
const clearSessionMoodCacheMock = jest.fn()
const debugLogMock = jest.fn()

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: (...args: unknown[]) => requireGuildMock(...args),
    requireDJRole: (...args: unknown[]) => requireDJRoleMock(...args),
    requireDJRoleInGuild: (...args: unknown[]) => requireDJRoleMock(...args),
    requireQueue: (...args: unknown[]) => requireQueueMock(...args),
    requireCurrentTrack: (...args: unknown[]) =>
        requireCurrentTrackMock(...args),
    requireIsPlaying: (...args: unknown[]) => requireIsPlayingMock(...args),
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createErrorEmbed: (...args: unknown[]) => createErrorEmbedMock(...args),
    createSuccessEmbed: (...args: unknown[]) => createSuccessEmbedMock(...args),
}))

jest.mock('../../../utils/general/responseEmbeds', () => ({
    buildCommandTrackEmbed: (...args: unknown[]) =>
        buildCommandTrackEmbedMock(...args),
}))

jest.mock('../../../services/musicManagement/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

jest.mock('../../../services/musicRecommendation/autoplay/replenisher', () => ({
    clearSessionMoodCache: (...args: unknown[]) =>
        clearSessionMoodCacheMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: jest.fn(),
}))

const captureAutoplayTrackMock = jest.fn((track: any) =>
    track ? { trackKey: `key:${track.title}`, title: track.title } : null,
)
const maybePromptAutoplayFeedbackMock = jest.fn()

jest.mock(
    '../../../services/musicRecommendation/autoplayFeedbackPrompt',
    () => ({
        captureAutoplayTrack: (...args: unknown[]) =>
            captureAutoplayTrackMock(...(args as [any])),
        maybePromptAutoplayFeedback: (...args: unknown[]) =>
            maybePromptAutoplayFeedbackMock(...args),
    }),
)

function createInteraction(guildId = 'guild-1') {
    return {
        guildId,
        user: { tag: 'User#0001' },
        deferReply: jest.fn().mockResolvedValue(undefined),
    } as any
}

function createQueue(guildId = 'guild-1') {
    return {
        guild: { id: guildId },
        currentTrack: { title: 'Current Song' },
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

describe('skip command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        jest.useFakeTimers()
        requireGuildMock.mockResolvedValue(true)
        requireDJRoleMock.mockResolvedValue(true)
        requireQueueMock.mockResolvedValue(true)
        requireCurrentTrackMock.mockResolvedValue(true)
        requireIsPlayingMock.mockResolvedValue(true)
        interactionReplyMock.mockResolvedValue(undefined)
        createSuccessEmbedMock.mockReturnValue({ title: 'Song skipped' })
        buildCommandTrackEmbedMock.mockReturnValue({ title: 'Now playing' })
        const queue = createQueue('guild-1')
        resolveGuildQueueMock.mockReturnValue({ queue })
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    it('clears session mood cache on successful skip', async () => {
        const queue = createQueue('guild-1')
        resolveGuildQueueMock.mockReturnValue({ queue })

        await skipCommand.execute({
            interaction: createInteraction('guild-1'),
            client: {} as any,
        })

        expect(clearSessionMoodCacheMock).toHaveBeenCalledWith('guild-1')
    })

    it('runs cheap queue checks before the defer and the DJ check after it (#2977)', async () => {
        const order: string[] = []
        const queue = createQueue('guild-1')
        queue.node.skip.mockImplementation(() => {
            order.push('skip')
        })
        resolveGuildQueueMock.mockReturnValue({ queue })
        requireGuildMock.mockImplementation(async () => {
            order.push('requireGuild')
            return true
        })
        requireIsPlayingMock.mockImplementation(async () => {
            order.push('requireIsPlaying')
            return true
        })
        requireDJRoleMock.mockImplementation(async () => {
            order.push('requireDJRole')
            return true
        })
        const interaction = createInteraction('guild-1')
        interaction.deferReply.mockImplementation(async () => {
            order.push('defer')
        })

        await skipCommand.execute({ interaction, client: {} as any })

        expect(order).toEqual([
            'requireGuild',
            'requireIsPlaying',
            'defer',
            'requireDJRole',
            'skip',
        ])
    })

    it('does not defer when a cheap check fails, so its reply stays ephemeral', async () => {
        requireIsPlayingMock.mockResolvedValue(false)
        const interaction = createInteraction('guild-1')

        await skipCommand.execute({ interaction, client: {} as any })

        expect(interaction.deferReply).not.toHaveBeenCalled()
    })

    it('still skips when deferReply rejects (e.g. 10062 Unknown interaction)', async () => {
        const queue = createQueue('guild-1')
        resolveGuildQueueMock.mockReturnValue({ queue })
        const interaction = createInteraction('guild-1')
        interaction.deferReply.mockRejectedValue(
            Object.assign(new Error('Unknown interaction'), { code: 10062 }),
        )

        await skipCommand.execute({ interaction, client: {} as any })

        expect(queue.node.skip).toHaveBeenCalled()
        expect(debugLogMock).toHaveBeenCalled()
    })

    it('skips the current song', async () => {
        const queue = createQueue('guild-1')
        resolveGuildQueueMock.mockReturnValue({ queue })

        await skipCommand.execute({
            interaction: createInteraction('guild-1'),
            client: {} as any,
        })

        expect(queue.node.skip).toHaveBeenCalled()
    })

    // discord-player makes the next track current as soon as the skip lands,
    // then spends seconds resolving its stream. play() with no argument
    // would dispatch the track behind it, so the request at the head of the
    // queue was replaced by the autoplay pick queued after it.
    it('leaves the next track alone while its stream is still loading', async () => {
        const queue = createQueue('guild-1')
        queue.isPlaying.mockReturnValueOnce(true).mockReturnValue(false)
        queue.node.skip.mockImplementation(() => {
            queue.currentTrack = { title: 'Requested Song' }
        })
        resolveGuildQueueMock.mockReturnValue({ queue })

        await skipCommand.execute({
            interaction: createInteraction('guild-1'),
            client: {} as any,
        })
        await jest.advanceTimersByTimeAsync(500)

        expect(queue.node.play).not.toHaveBeenCalled()
    })

    it('restarts playback when the skip left nothing current', async () => {
        const queue = createQueue('guild-1')
        queue.isPlaying.mockReturnValueOnce(true).mockReturnValue(false)
        queue.node.skip.mockImplementation(() => {
            queue.currentTrack = null
        })
        resolveGuildQueueMock.mockReturnValue({ queue })

        await skipCommand.execute({
            interaction: createInteraction('guild-1'),
            client: {} as any,
        })
        await jest.advanceTimersByTimeAsync(500)

        expect(queue.node.play).toHaveBeenCalledTimes(1)
    })

    it('returns early if guild validation fails', async () => {
        requireGuildMock.mockResolvedValue(false)

        await skipCommand.execute({
            interaction: createInteraction('guild-1'),
            client: {} as any,
        })

        expect(clearSessionMoodCacheMock).not.toHaveBeenCalled()
    })

    it('returns early if DJ role check fails', async () => {
        requireDJRoleMock.mockResolvedValue(false)

        await skipCommand.execute({
            interaction: createInteraction('guild-1'),
            client: {} as any,
        })

        expect(clearSessionMoodCacheMock).not.toHaveBeenCalled()
    })

    it('returns early if queue check fails', async () => {
        resolveGuildQueueMock.mockReturnValue({ queue: null })
        requireQueueMock.mockResolvedValue(false)

        await skipCommand.execute({
            interaction: createInteraction('guild-1'),
            client: {} as any,
        })

        expect(clearSessionMoodCacheMock).not.toHaveBeenCalled()
    })

    it('asks about the autoplay track that was skipped, not the next one', async () => {
        const queue = createQueue('guild-1')
        queue.currentTrack = { title: 'Autoplay Pick' }
        queue.node.skip.mockImplementation(() => {
            queue.currentTrack = { title: 'Next Song' }
        })
        resolveGuildQueueMock.mockReturnValue({ queue })
        const interaction = createInteraction('guild-1')

        await skipCommand.execute({ interaction, client: {} as any })

        expect(maybePromptAutoplayFeedbackMock).toHaveBeenCalledWith(
            interaction,
            { trackKey: 'key:Autoplay Pick', title: 'Autoplay Pick' },
        )
    })

    it('does not prompt when the skip fails', async () => {
        const queue = createQueue('guild-1')
        queue.node.skip.mockImplementation(() => {
            throw new Error('boom')
        })
        resolveGuildQueueMock.mockReturnValue({ queue })

        await skipCommand.execute({
            interaction: createInteraction('guild-1'),
            client: {} as any,
        })

        expect(maybePromptAutoplayFeedbackMock).not.toHaveBeenCalled()
    })
})
