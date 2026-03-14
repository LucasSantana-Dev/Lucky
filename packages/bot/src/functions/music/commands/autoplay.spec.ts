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
const warnLogMock = jest.fn()
const resolveGuildQueueMock = jest.fn()

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

jest.mock('../../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
    warnLog: (...args: unknown[]) => warnLogMock(...args),
}))

function createInteraction(guildId = 'guild-1') {
    const interaction = {
        guildId,
        deferred: false,
        replied: false,
        user: { id: 'user-1' },
        deferReply: jest.fn(async () => {
            interaction.deferred = true
        }),
    }

    return interaction as any
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

function createClient({ directQueue = null }: { directQueue?: unknown }) {
    return {
        player: {
            nodes: {
                get: jest.fn(() => directQueue),
            },
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
        resolveGuildQueueMock.mockReturnValue({
            queue: null,
            source: 'miss',
            diagnostics: {
                guildId: 'guild-1',
                cacheSize: 0,
                cacheSampleKeys: [],
            },
        })
    })

    it('uses resolved guild queue when fallback source recovers queue', async () => {
        const queue = createQueue(QueueRepeatMode.OFF)
        const client = createClient({
            directQueue: null,
        })
        const interaction = createInteraction()
        resolveGuildQueueMock.mockReturnValue({
            queue,
            source: 'cache.guild',
            diagnostics: {
                guildId: 'guild-1',
                cacheSize: 1,
                cacheSampleKeys: ['guild-1'],
            },
        })

        await autoplayCommand.execute({
            client,
            interaction,
        } as any)

        expect(interaction.deferReply).toHaveBeenCalledTimes(1)
        expect(resolveGuildQueueMock).toHaveBeenCalledWith(client, 'guild-1')
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
        })
        const interaction = createInteraction()
        resolveGuildQueueMock.mockReturnValue({
            queue,
            source: 'nodes.get',
            diagnostics: {
                guildId: 'guild-1',
                cacheSize: 1,
                cacheSampleKeys: ['guild-1'],
            },
        })

        await autoplayCommand.execute({
            client,
            interaction,
        } as any)

        expect(interaction.deferReply).toHaveBeenCalledTimes(1)
        expect(queue.setRepeatMode).toHaveBeenCalledWith(QueueRepeatMode.OFF)
        expect(replenishQueueMock).not.toHaveBeenCalled()
        expect(interactionReplyMock).toHaveBeenCalled()
    })

    it('returns early when interaction guild id is missing', async () => {
        const queue = createQueue(QueueRepeatMode.OFF)
        const client = createClient({
            directQueue: queue,
        })
        const interaction = createInteraction(null as unknown as string)

        await autoplayCommand.execute({
            client,
            interaction,
        } as any)

        expect(interaction.deferReply).not.toHaveBeenCalled()
        expect(requireQueueMock).not.toHaveBeenCalled()
        expect(interactionReplyMock).not.toHaveBeenCalled()
        expect(resolveGuildQueueMock).not.toHaveBeenCalled()
    })

    it('passes null queue to validator when resolver misses', async () => {
        const client = createClient({ directQueue: null })
        const interaction = createInteraction()
        requireQueueMock.mockResolvedValue(false)

        await autoplayCommand.execute({
            client,
            interaction,
        } as any)

        expect(interaction.deferReply).toHaveBeenCalledTimes(1)
        expect(requireQueueMock).toHaveBeenCalledWith(null, interaction)
        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('passes null queue to validator when resolver returns miss diagnostics', async () => {
        const client = createClient({
            directQueue: null,
        })
        const interaction = createInteraction('guild-1')
        requireQueueMock.mockResolvedValue(false)
        resolveGuildQueueMock.mockReturnValue({
            queue: null,
            source: 'miss',
            diagnostics: {
                guildId: 'guild-1',
                cacheSize: 2,
                cacheSampleKeys: ['guild-2', 'guild-3'],
            },
        })

        await autoplayCommand.execute({
            client,
            interaction,
        } as any)

        expect(interaction.deferReply).toHaveBeenCalledTimes(1)
        expect(requireQueueMock).toHaveBeenCalledWith(null, interaction)
        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('replies before replenishment finishes', async () => {
        const queue = createQueue(QueueRepeatMode.OFF)
        const client = createClient({
            directQueue: queue,
        })
        const interaction = createInteraction()
        let resolveReplenish: () => void = () => {}

        replenishQueueMock.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    resolveReplenish = resolve
                }),
        )
        resolveGuildQueueMock.mockReturnValue({
            queue,
            source: 'nodes.get',
            diagnostics: {
                guildId: 'guild-1',
                cacheSize: 1,
                cacheSampleKeys: ['guild-1'],
            },
        })

        const executePromise = autoplayCommand.execute({
            client,
            interaction,
        } as any)
        const completion = await Promise.race([
            executePromise.then(() => 'done'),
            new Promise<string>((resolve) => {
                setTimeout(() => resolve('timeout'), 25)
            }),
        ])

        expect(completion).toBe('done')
        expect(interactionReplyMock).toHaveBeenCalled()
        expect(replenishQueueMock).toHaveBeenCalledWith(queue)

        resolveReplenish()
        await executePromise
    })

    it('logs error and still replies when queue replenish fails', async () => {
        const queue = createQueue(QueueRepeatMode.OFF)
        const client = createClient({
            directQueue: queue,
        })
        const interaction = createInteraction()
        replenishQueueMock.mockRejectedValue(new Error('replenish failed'))
        resolveGuildQueueMock.mockReturnValue({
            queue,
            source: 'nodes.get',
            diagnostics: {
                guildId: 'guild-1',
                cacheSize: 1,
                cacheSampleKeys: ['guild-1'],
            },
        })

        await autoplayCommand.execute({
            client,
            interaction,
        } as any)

        await Promise.resolve()
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
        })
        const interaction = createInteraction()
        resolveGuildQueueMock.mockReturnValue({
            queue,
            source: 'nodes.get',
            diagnostics: {
                guildId: 'guild-1',
                cacheSize: 1,
                cacheSampleKeys: ['guild-1'],
            },
        })

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
