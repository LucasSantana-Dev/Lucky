import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { QueueRepeatMode } from 'discord-player'
import autoplayCommand from './autoplay'

const requireGuildMock = jest.fn()
const requireQueueMock = jest.fn()
const interactionReplyMock = jest.fn()
const createEmbedMock = jest.fn((payload: unknown) => payload)
const replenishQueueMock = jest.fn()
const debugLogMock = jest.fn()
const errorLogMock = jest.fn()

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: (...args: unknown[]) => requireGuildMock(...args),
    requireQueue: (...args: unknown[]) => requireQueueMock(...args),
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createEmbed: (...args: unknown[]) => createEmbedMock(...args),
    EMBED_COLORS: {
        AUTOPLAY: '#00BFFF',
        ERROR: '#FF0000',
    },
    EMOJIS: {
        AUTOPLAY: '🔄',
        ERROR: '❌',
    },
}))

jest.mock('../../../utils/music/trackManagement/queueOperations', () => ({
    replenishQueue: (...args: unknown[]) => replenishQueueMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

function createInteraction(guildId = 'guild-1') {
    return {
        guildId,
    } as any
}

function createQueue(repeatMode = QueueRepeatMode.OFF) {
    return {
        guild: { id: 'guild-1' },
        repeatMode,
        currentTrack: { title: 'Song A' },
        tracks: { size: 0 },
        setRepeatMode: jest.fn(),
    } as any
}

function createClient({
    directQueue = null,
    cachedQueues = [],
    includeCache = true,
}: {
    directQueue?: unknown
    cachedQueues?: unknown[]
    includeCache?: boolean
}) {
    const nodes: {
        get: () => unknown
        cache?: { values: () => Iterable<unknown> }
    } = {
        get: jest.fn(() => directQueue),
    }

    if (includeCache) {
        nodes.cache = {
            values: jest.fn(() => cachedQueues.values()),
        }
    }

    return {
        player: {
            nodes,
        },
    } as any
}

describe('autoplay command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireGuildMock.mockResolvedValue(true)
        requireQueueMock.mockImplementation(async (queue: unknown) =>
            Boolean(queue),
        )
    })

    it('uses cached guild queue when direct lookup misses', async () => {
        const queue = createQueue(QueueRepeatMode.OFF)
        const client = createClient({
            directQueue: null,
            cachedQueues: [queue],
        })
        const interaction = createInteraction()

        await autoplayCommand.execute({
            client,
            interaction,
        } as any)

        expect(requireQueueMock).toHaveBeenCalledWith(queue, interaction)
        expect(queue.setRepeatMode).toHaveBeenCalledWith(
            QueueRepeatMode.AUTOPLAY,
        )
        expect(replenishQueueMock).toHaveBeenCalledWith(queue)
        expect(interactionReplyMock).toHaveBeenCalled()
    })

    it('disables autoplay when already enabled', async () => {
        const queue = createQueue(QueueRepeatMode.AUTOPLAY)
        const client = createClient({
            directQueue: queue,
            cachedQueues: [queue],
        })
        const interaction = createInteraction()

        await autoplayCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.setRepeatMode).toHaveBeenCalledWith(QueueRepeatMode.OFF)
        expect(replenishQueueMock).not.toHaveBeenCalled()
        expect(interactionReplyMock).toHaveBeenCalled()
    })

    it('returns early when interaction guild id is missing', async () => {
        const queue = createQueue(QueueRepeatMode.OFF)
        const client = createClient({
            directQueue: queue,
            cachedQueues: [queue],
        })
        const interaction = createInteraction(null as unknown as string)

        await autoplayCommand.execute({
            client,
            interaction,
        } as any)

        expect(requireQueueMock).not.toHaveBeenCalled()
        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('passes null queue to validator when cache is unavailable', async () => {
        const client = createClient({
            directQueue: null,
            includeCache: false,
        })
        const interaction = createInteraction()
        requireQueueMock.mockResolvedValue(false)

        await autoplayCommand.execute({
            client,
            interaction,
        } as any)

        expect(requireQueueMock).toHaveBeenCalledWith(null, interaction)
        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('passes null queue to validator when cache has no matching guild', async () => {
        const queue = {
            ...createQueue(QueueRepeatMode.OFF),
            guild: { id: 'guild-2' },
        }
        const client = createClient({
            directQueue: null,
            cachedQueues: [queue],
        })
        const interaction = createInteraction('guild-1')
        requireQueueMock.mockResolvedValue(false)

        await autoplayCommand.execute({
            client,
            interaction,
        } as any)

        expect(requireQueueMock).toHaveBeenCalledWith(null, interaction)
        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('logs error and still replies when queue replenish fails', async () => {
        const queue = createQueue(QueueRepeatMode.OFF)
        const client = createClient({
            directQueue: queue,
            cachedQueues: [queue],
        })
        const interaction = createInteraction()
        replenishQueueMock.mockRejectedValue(new Error('replenish failed'))

        await autoplayCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.setRepeatMode).toHaveBeenCalledWith(
            QueueRepeatMode.AUTOPLAY,
        )
        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Error replenishing queue after enabling autoplay:',
            }),
        )
        expect(interactionReplyMock).toHaveBeenCalled()
    })

    it('uses autoplay error response when execution throws unexpectedly', async () => {
        const queue = createQueue(QueueRepeatMode.OFF)
        queue.setRepeatMode.mockImplementation(() => {
            throw new Error('unexpected')
        })
        const client = createClient({
            directQueue: queue,
            cachedQueues: [queue],
        })
        const interaction = createInteraction()

        await autoplayCommand.execute({
            client,
            interaction,
        } as any)

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Error in autoplay command:',
            }),
        )
        expect(createEmbedMock).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Error',
            }),
        )
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    ephemeral: true,
                }),
            }),
        )
    })
})
