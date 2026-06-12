import { beforeEach, describe, expect, it, jest, afterEach } from '@jest/globals'

const requireGuildMock = jest.fn()
const requireDJRoleMock = jest.fn()
const requireQueueMock = jest.fn()
const requireCurrentTrackMock = jest.fn()
const requireIsPlayingMock = jest.fn()
const resolveGuildQueueMock = jest.fn()
const interactionReplyMock = jest.fn()
const createErrorEmbedMock = jest.fn()
const createSuccessEmbedMock = jest.fn()
const buildCommandTrackEmbedMock = jest.fn()
const clearSessionMoodCacheMock = jest.fn()
const debugLogMock = jest.fn()
const errorLogMock = jest.fn()

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: (...args: unknown[]) => requireGuildMock(...args),
    requireDJRole: (...args: unknown[]) => requireDJRoleMock(...args),
    requireQueue: (...args: unknown[]) => requireQueueMock(...args),
    requireCurrentTrack: (...args: unknown[]) => requireCurrentTrackMock(...args),
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
    buildCommandTrackEmbed: (...args: unknown[]) => buildCommandTrackEmbedMock(...args),
}))

jest.mock('../../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

jest.mock('../../../utils/music/autoplay/replenisher', () => ({
    clearSessionMoodCache: (...args: unknown[]) => clearSessionMoodCacheMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

import previousCommand from './previous'

function makeInteraction(overrides: Record<string, unknown> = {}) {
    return {
        guildId: 'guild-1',
        user: { id: 'user-1' },
        ...overrides,
    } as unknown as Parameters<typeof previousCommand.execute>[0]['interaction']
}

function makeQueue(overrides: Record<string, unknown> = {}) {
    return {
        isPlaying: jest.fn().mockReturnValue(true),
        currentTrack: { title: 'Current Track', author: 'Artist' },
        tracks: { size: 5 },
        history: {
            isEmpty: jest.fn().mockReturnValue(false),
            previous: jest.fn().mockResolvedValue(undefined),
        },
        node: {
            seek: jest.fn().mockResolvedValue(undefined),
            play: jest.fn().mockResolvedValue(undefined),
        },
        ...overrides,
    } as unknown as Parameters<typeof previousCommand.execute>[0]['client']
}

describe('previous command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        jest.useFakeTimers()
        requireGuildMock.mockResolvedValue(true)
        requireDJRoleMock.mockResolvedValue(true)
        requireQueueMock.mockResolvedValue(true)
        requireCurrentTrackMock.mockResolvedValue(true)
        requireIsPlayingMock.mockResolvedValue(true)
        resolveGuildQueueMock.mockReturnValue({
            queue: makeQueue(),
        })
        buildCommandTrackEmbedMock.mockReturnValue({ title: 'Track Embed' })
        createSuccessEmbedMock.mockReturnValue({ title: 'Success' })
        createErrorEmbedMock.mockReturnValue({ title: 'Error' })
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    it('has correct name and category', () => {
        expect(previousCommand.data.name).toBe('previous')
        expect(previousCommand.category).toBe('music')
    })

    it('calls history.previous when history is not empty', async () => {
        const queue = makeQueue()
        resolveGuildQueueMock.mockReturnValue({ queue })

        const interaction = makeInteraction()
        await previousCommand.execute({ client: {} as any, interaction })

        expect(queue.history.previous).toHaveBeenCalledWith(true)
        expect(queue.node.seek).not.toHaveBeenCalled()
    })

    it('calls node.seek(0) when history is empty', async () => {
        const queue = makeQueue({
            history: {
                isEmpty: jest.fn().mockReturnValue(true),
                previous: jest.fn(),
            },
        })
        resolveGuildQueueMock.mockReturnValue({ queue })

        const interaction = makeInteraction()
        await previousCommand.execute({ client: {} as any, interaction })

        expect(queue.history.previous).not.toHaveBeenCalled()
        expect(queue.node.seek).toHaveBeenCalledWith(0)
    })

    it('does not seek when history is empty and no current track', async () => {
        const queue = makeQueue({
            currentTrack: null,
            history: {
                isEmpty: jest.fn().mockReturnValue(true),
                previous: jest.fn(),
            },
        })
        resolveGuildQueueMock.mockReturnValue({ queue })

        const interaction = makeInteraction()
        await previousCommand.execute({ client: {} as any, interaction })

        expect(queue.node.seek).not.toHaveBeenCalled()
    })

    it('clears session mood cache after playing previous', async () => {
        const queue = makeQueue()
        resolveGuildQueueMock.mockReturnValue({ queue })

        const interaction = makeInteraction()
        await previousCommand.execute({ client: {} as any, interaction })

        expect(clearSessionMoodCacheMock).toHaveBeenCalledWith('guild-1')
    })

    it('returns early when requireGuild fails', async () => {
        requireGuildMock.mockResolvedValue(false)
        const interaction = makeInteraction()
        await previousCommand.execute({ client: {} as any, interaction })
        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('returns early when requireDJRole fails', async () => {
        requireDJRoleMock.mockResolvedValue(false)
        const interaction = makeInteraction()
        await previousCommand.execute({ client: {} as any, interaction })
        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('returns early when requireQueue fails', async () => {
        requireQueueMock.mockResolvedValue(false)
        const interaction = makeInteraction()
        await previousCommand.execute({ client: {} as any, interaction })
        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('returns early when requireCurrentTrack fails', async () => {
        requireCurrentTrackMock.mockResolvedValue(false)
        const interaction = makeInteraction()
        await previousCommand.execute({ client: {} as any, interaction })
        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('returns early when requireIsPlaying fails', async () => {
        requireIsPlayingMock.mockResolvedValue(false)
        const interaction = makeInteraction()
        await previousCommand.execute({ client: {} as any, interaction })
        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('handles not playing case', async () => {
        const queue = makeQueue({ isPlaying: jest.fn().mockReturnValue(false) })
        resolveGuildQueueMock.mockReturnValue({ queue })

        const interaction = makeInteraction()
        await previousCommand.execute({ client: {} as any, interaction })

        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    embeds: [expect.anything()],
                }),
            }),
        )
    })

    it('calls buildCommandTrackEmbed with current track when previous succeeds', async () => {
        const queue = makeQueue()
        resolveGuildQueueMock.mockReturnValue({ queue })

        const interaction = makeInteraction()
        await previousCommand.execute({ client: {} as any, interaction })

        expect(buildCommandTrackEmbedMock).toHaveBeenCalledWith(
            queue.currentTrack,
            expect.stringContaining('⏮️'),
            interaction.user,
        )
    })

    it('catches and handles errors', async () => {
        const queue = makeQueue({
            history: {
                isEmpty: jest.fn().mockReturnValue(false),
                previous: jest.fn().mockRejectedValue(new Error('Test error')),
            },
        })
        resolveGuildQueueMock.mockReturnValue({ queue })

        const interaction = makeInteraction()
        await previousCommand.execute({ client: {} as any, interaction })

        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    embeds: [expect.anything()],
                }),
            }),
        )
    })

})
