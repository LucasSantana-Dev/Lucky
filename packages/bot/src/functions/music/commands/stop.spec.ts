import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import stopCommand from './stop'

const requireGuildMock = jest.fn()
const requireQueueMock = jest.fn()
const requireDJRoleMock = jest.fn()
const interactionReplyMock = jest.fn()
const createSuccessEmbedMock = jest.fn()
const resolveGuildQueueMock = jest.fn()
const markIntentionalStopMock = jest.fn()
const deleteSnapshotMock = jest.fn()
const clearSessionMoodCacheMock = jest.fn()

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: (...args: unknown[]) => requireGuildMock(...args),
    requireQueue: (...args: unknown[]) => requireQueueMock(...args),
    requireDJRole: (...args: unknown[]) => requireDJRoleMock(...args),
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createSuccessEmbed: (...args: unknown[]) => createSuccessEmbedMock(...args),
}))

jest.mock('../../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

jest.mock('../../../utils/music/watchdog', () => ({
    musicWatchdogService: {
        markIntentionalStop: (...args: unknown[]) =>
            markIntentionalStopMock(...args),
    },
}))

jest.mock('../../../utils/music/sessionSnapshots', () => ({
    musicSessionSnapshotService: {
        deleteSnapshot: (...args: unknown[]) => deleteSnapshotMock(...args),
    },
}))

jest.mock('../../../utils/music/autoplay/replenisher', () => ({
    clearSessionMoodCache: (...args: unknown[]) =>
        clearSessionMoodCacheMock(...args),
}))

function createInteraction(guildId = 'guild-1') {
    return { guildId, user: { tag: 'User#0001' } } as any
}

function createQueue(guildId = 'guild-1') {
    return {
        guild: { id: guildId },
        node: {
            stop: jest.fn(),
        },
        clear: jest.fn(),
        delete: jest.fn(),
    } as any
}

describe('stop command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireGuildMock.mockResolvedValue(true)
        requireQueueMock.mockResolvedValue(true)
        requireDJRoleMock.mockResolvedValue(true)
        interactionReplyMock.mockResolvedValue(undefined)
        createSuccessEmbedMock.mockReturnValue({ title: 'Playback stopped' })
        deleteSnapshotMock.mockResolvedValue(undefined)
        // Set default mock for resolveGuildQueue
        const queue = createQueue('guild-1')
        resolveGuildQueueMock.mockReturnValue({ queue })
    })

    it('clears session mood cache on successful stop', async () => {
        const queue = createQueue('guild-1')
        resolveGuildQueueMock.mockReturnValue({ queue })

        await stopCommand.execute({
            interaction: createInteraction('guild-1'),
            client: {} as any,
        })

        expect(clearSessionMoodCacheMock).toHaveBeenCalledWith('guild-1')
    })

    it('marks intentional stop', async () => {
        const queue = createQueue('guild-1')
        resolveGuildQueueMock.mockReturnValue({ queue })

        await stopCommand.execute({
            interaction: createInteraction('guild-1'),
            client: {} as any,
        })

        expect(markIntentionalStopMock).toHaveBeenCalledWith('guild-1')
    })

    it('deletes session snapshot', async () => {
        const queue = createQueue('guild-1')
        resolveGuildQueueMock.mockReturnValue({ queue })

        await stopCommand.execute({
            interaction: createInteraction('guild-1'),
            client: {} as any,
        })

        expect(deleteSnapshotMock).toHaveBeenCalledWith('guild-1')
    })

    it('stops the queue', async () => {
        const queue = createQueue('guild-1')
        resolveGuildQueueMock.mockReturnValue({ queue })

        await stopCommand.execute({
            interaction: createInteraction('guild-1'),
            client: {} as any,
        })

        expect(queue.node.stop).toHaveBeenCalled()
    })

    it('clears the queue', async () => {
        const queue = createQueue('guild-1')
        resolveGuildQueueMock.mockReturnValue({ queue })

        await stopCommand.execute({
            interaction: createInteraction('guild-1'),
            client: {} as any,
        })

        expect(queue.clear).toHaveBeenCalled()
    })

    it('deletes the queue', async () => {
        const queue = createQueue('guild-1')
        resolveGuildQueueMock.mockReturnValue({ queue })

        await stopCommand.execute({
            interaction: createInteraction('guild-1'),
            client: {} as any,
        })

        expect(queue.delete).toHaveBeenCalled()
    })

    it('returns early if guild check fails', async () => {
        requireGuildMock.mockResolvedValue(false)

        await stopCommand.execute({
            interaction: createInteraction('guild-1'),
            client: {} as any,
        })

        expect(requireQueueMock).not.toHaveBeenCalled()
        expect(clearSessionMoodCacheMock).not.toHaveBeenCalled()
    })

    it('returns early if queue check fails', async () => {
        resolveGuildQueueMock.mockReturnValue({ queue: null })
        requireQueueMock.mockResolvedValue(false)

        await stopCommand.execute({
            interaction: createInteraction('guild-1'),
            client: {} as any,
        })

        expect(clearSessionMoodCacheMock).not.toHaveBeenCalled()
    })

    it('returns early if DJ role check fails', async () => {
        requireDJRoleMock.mockResolvedValue(false)

        await stopCommand.execute({
            interaction: createInteraction('guild-1'),
            client: {} as any,
        })

        expect(clearSessionMoodCacheMock).not.toHaveBeenCalled()
    })
})
