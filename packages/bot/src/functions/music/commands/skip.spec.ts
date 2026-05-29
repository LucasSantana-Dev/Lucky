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

jest.mock('../../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

jest.mock('../../../utils/music/autoplay/replenisher', () => ({
    clearSessionMoodCache: (...args: unknown[]) =>
        clearSessionMoodCacheMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
}))

function createInteraction(guildId = 'guild-1') {
    return {
        guildId,
        user: { tag: 'User#0001' },
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
        // Set default mock for resolveGuildQueue
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

    it('skips the current song', async () => {
        const queue = createQueue('guild-1')
        resolveGuildQueueMock.mockReturnValue({ queue })

        await skipCommand.execute({
            interaction: createInteraction('guild-1'),
            client: {} as any,
        })

        expect(queue.node.skip).toHaveBeenCalled()
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
})
