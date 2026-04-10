import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import autoplayCommand from './autoplay'

const QueueRepeatMode = {
    OFF: 0,
    AUTOPLAY: 3,
} as const

const requireGuildMock = jest.fn()
const interactionReplyMock = jest.fn()
const createEmbedMock = jest.fn((payload: unknown) => payload)
const createErrorEmbedMock = jest.fn((title: string, desc: string) => ({
    title,
    description: desc,
}))
const replenishQueueMock = jest.fn()
const debugLogMock = jest.fn()
const errorLogMock = jest.fn()
const warnLogMock = jest.fn()
const resolveGuildQueueMock = jest.fn()
const getGuildSettingsMock = jest.fn()
const setGuildSettingsMock = jest.fn()

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: (...args: unknown[]) => requireGuildMock(...args),
}))

jest.mock('discord-player', () => ({
    QueueRepeatMode: {
        OFF: 0,
        AUTOPLAY: 3,
    },
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createEmbed: (payload: unknown) => createEmbedMock(payload),
    createErrorEmbed: (title: string, desc: string) =>
        createErrorEmbedMock(title, desc),
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

jest.mock('@lucky/shared/services', () => ({
    guildSettingsService: {
        getGuildSettings: (...args: unknown[]) => getGuildSettingsMock(...args),
        setGuildSettings: (...args: unknown[]) => setGuildSettingsMock(...args),
    },
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
        getGuildSettingsMock.mockResolvedValue(null)
        setGuildSettingsMock.mockResolvedValue(true)
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

    it('enables autoplay on active queue and persists preference', async () => {
        const queue = createQueue(QueueRepeatMode.OFF)
        const client = createClient({ directQueue: null })
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

        expect(queue.setRepeatMode).toHaveBeenCalledWith(
            QueueRepeatMode.AUTOPLAY,
        )
        expect(setGuildSettingsMock).toHaveBeenCalledWith('guild-1', {
            autoPlayEnabled: true,
        })
        expect(replenishQueueMock).toHaveBeenCalledWith(queue)
        expect(interactionReplyMock).toHaveBeenCalled()
    })

    it('disables autoplay when already enabled', async () => {
        const queue = createQueue(QueueRepeatMode.AUTOPLAY)
        const client = createClient({ directQueue: queue })
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

        expect(queue.setRepeatMode).toHaveBeenCalledWith(QueueRepeatMode.OFF)
        expect(setGuildSettingsMock).toHaveBeenCalledWith('guild-1', {
            autoPlayEnabled: false,
        })
        expect(replenishQueueMock).not.toHaveBeenCalled()
        expect(interactionReplyMock).toHaveBeenCalled()
    })

    it('enables autoplay when no queue exists and settings are missing', async () => {
        const client = createClient({ directQueue: null })
        const interaction = createInteraction()

        await autoplayCommand.execute({
            client,
            interaction,
        } as any)

        expect(setGuildSettingsMock).toHaveBeenCalledWith('guild-1', {
            autoPlayEnabled: true,
        })
        expect(interactionReplyMock).toHaveBeenCalled()
        const embedPayload = createEmbedMock.mock.calls[0]?.[0] as {
            description: string
        }
        expect(embedPayload.description).toContain('Next time you use /play')
    })

    it('shows an error when enabling autoplay without a queue fails to persist', async () => {
        const client = createClient({ directQueue: null })
        const interaction = createInteraction()
        setGuildSettingsMock.mockResolvedValue(false)

        await autoplayCommand.execute({
            client,
            interaction,
        } as any)

        expect(warnLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Failed to persist autoplay enabled preference',
            }),
        )
        expect(createEmbedMock).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Autoplay preference not saved',
            }),
        )
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    ephemeral: true,
                }),
            }),
        )
        expect(replenishQueueMock).not.toHaveBeenCalled()
    })

    it('shows a queue-only warning when disabling autoplay cannot persist', async () => {
        const queue = createQueue(QueueRepeatMode.AUTOPLAY)
        const client = createClient({ directQueue: queue })
        const interaction = createInteraction()
        setGuildSettingsMock.mockResolvedValue(false)
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

        expect(queue.setRepeatMode).toHaveBeenCalledWith(QueueRepeatMode.OFF)
        expect(warnLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Failed to persist autoplay disabled preference',
            }),
        )
        expect(createEmbedMock).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Autoplay disabled for current queue only',
            }),
        )
        expect(replenishQueueMock).not.toHaveBeenCalled()
    })

    it('shows a queue-only warning when enabling autoplay cannot persist', async () => {
        const queue = createQueue(QueueRepeatMode.OFF)
        const client = createClient({ directQueue: queue })
        const interaction = createInteraction()
        setGuildSettingsMock.mockResolvedValue(false)
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

        expect(queue.setRepeatMode).toHaveBeenCalledWith(
            QueueRepeatMode.AUTOPLAY,
        )
        expect(warnLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Failed to persist autoplay enabled preference',
            }),
        )
        expect(createEmbedMock).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Autoplay enabled for current queue only',
            }),
        )
        expect(replenishQueueMock).toHaveBeenCalledWith(queue)
    })

    it('disables stored preference when no queue and was enabled', async () => {
        const client = createClient({ directQueue: null })
        const interaction = createInteraction()
        getGuildSettingsMock.mockResolvedValue({ autoPlayEnabled: true })

        await autoplayCommand.execute({
            client,
            interaction,
        } as any)

        expect(setGuildSettingsMock).toHaveBeenCalledWith('guild-1', {
            autoPlayEnabled: false,
        })
        expect(createEmbedMock).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Autoplay disabled' }),
        )
    })

    it('enables stored preference when no queue and autoplay was disabled', async () => {
        const client = createClient({ directQueue: null })
        const interaction = createInteraction()
        getGuildSettingsMock.mockResolvedValue({ autoPlayEnabled: false })

        await autoplayCommand.execute({
            client,
            interaction,
        } as any)

        expect(setGuildSettingsMock).toHaveBeenCalledWith('guild-1', {
            autoPlayEnabled: true,
        })
        expect(createEmbedMock).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Autoplay enabled' }),
        )
    })

    it('returns early when interaction guild id is missing', async () => {
        const queue = createQueue(QueueRepeatMode.OFF)
        const client = createClient({ directQueue: queue })
        const interaction = createInteraction(null as unknown as string)

        await autoplayCommand.execute({
            client,
            interaction,
        } as any)

        expect(interactionReplyMock).not.toHaveBeenCalled()
        expect(resolveGuildQueueMock).not.toHaveBeenCalled()
    })

    it('replies before replenishment finishes', async () => {
        const queue = createQueue(QueueRepeatMode.OFF)
        const client = createClient({ directQueue: queue })
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

    it('logs replenish failures after enabling autoplay', async () => {
        const queue = createQueue(QueueRepeatMode.OFF)
        const client = createClient({ directQueue: queue })
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
        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Error replenishing queue after enabling autoplay:',
            }),
        )
    })

    it('returns silently when deferReply throws unknown interaction error (10062)', async () => {
        const interaction = createInteraction()
        interaction.deferReply = jest
            .fn()
            .mockRejectedValue(
                Object.assign(new Error('Unknown interaction'), {
                    code: 10062,
                }),
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

        await autoplayCommand.execute({
            client: createClient({ directQueue: null }),
            interaction,
        } as any)

        expect(interactionReplyMock).not.toHaveBeenCalled()
        expect(getGuildSettingsMock).not.toHaveBeenCalled()
    })

    it('re-throws when deferReply fails with a non-10062 error', async () => {
        const interaction = createInteraction()
        const boom = new Error('network error')
        interaction.deferReply = jest.fn().mockRejectedValue(boom)
        resolveGuildQueueMock.mockReturnValue({
            queue: null,
            source: 'miss',
            diagnostics: {
                guildId: 'guild-1',
                cacheSize: 0,
                cacheSampleKeys: [],
            },
        })

        await expect(
            autoplayCommand.execute({
                client: createClient({ directQueue: null }),
                interaction,
            } as any),
        ).rejects.toThrow('network error')
    })

    it('uses autoplay error response when execution throws', async () => {
        const queue = createQueue(QueueRepeatMode.OFF)
        queue.setRepeatMode.mockImplementation(() => {
            throw new Error('unexpected')
        })
        const client = createClient({ directQueue: queue })
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
        expect(createErrorEmbedMock).toHaveBeenCalledWith(
            'Error',
            expect.any(String),
        )
    })
})
