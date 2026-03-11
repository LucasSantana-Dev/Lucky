import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import musicCommand from './music'

const interactionReplyMock = jest.fn()
const createEmbedMock = jest.fn((payload: unknown) => payload)
const errorEmbedMock = jest.fn((title: string, message: string) => ({
    type: 'error',
    title,
    message,
}))
const requireGuildMock = jest.fn()
const getAllStatusesMock = jest.fn()
const getGuildStateMock = jest.fn()
const getSnapshotMock = jest.fn()
const resolveGuildQueueMock = jest.fn()

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createEmbed: (...args: unknown[]) => createEmbedMock(...args),
    errorEmbed: (...args: unknown[]) => errorEmbedMock(...args),
    EMBED_COLORS: { INFO: '#00BFFF' },
    EMOJIS: { INFO: 'ℹ️' },
}))

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: (...args: unknown[]) => requireGuildMock(...args),
}))

jest.mock('../../../utils/music/search/providerHealth', () => ({
    providerHealthService: {
        getAllStatuses: (...args: unknown[]) => getAllStatusesMock(...args),
    },
}))

jest.mock('../../../utils/music/watchdog', () => ({
    musicWatchdogService: {
        getGuildState: (...args: unknown[]) => getGuildStateMock(...args),
    },
}))

jest.mock('../../../utils/music/sessionSnapshots', () => ({
    musicSessionSnapshotService: {
        getSnapshot: (...args: unknown[]) => getSnapshotMock(...args),
    },
}))

jest.mock('../../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

function createInteraction(subcommand = 'health', guildId = 'guild-1') {
    return {
        guildId,
        options: {
            getSubcommand: jest.fn(() => subcommand),
        },
    } as any
}

function createClient(queue?: unknown) {
    return {
        player: {},
        __queue: queue,
    } as any
}

describe('music command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireGuildMock.mockResolvedValue(true)
        getAllStatusesMock.mockReturnValue({
            youtube: {
                provider: 'youtube',
                score: 0.9,
                cooldownUntil: null,
                consecutiveFailures: 0,
            },
        })
        getGuildStateMock.mockReturnValue({
            timeoutMs: 25000,
            lastRecoveryAction: 'none',
            lastActivityAt: 0,
        })
        getSnapshotMock.mockResolvedValue(null)
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

    it('returns immediately when guild validation fails', async () => {
        requireGuildMock.mockResolvedValue(false)

        await musicCommand.execute({
            client: createClient(),
            interaction: createInteraction(),
        } as any)

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('replies with error for unknown subcommand', async () => {
        await musicCommand.execute({
            client: createClient(),
            interaction: createInteraction('unknown'),
        } as any)

        expect(errorEmbedMock).toHaveBeenCalledWith(
            'Error',
            'Unknown subcommand.',
        )
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    ephemeral: true,
                }),
            }),
        )
    })

    it('replies with error when guild id is missing', async () => {
        await musicCommand.execute({
            client: createClient(),
            interaction: createInteraction('health', null as unknown as string),
        } as any)

        expect(errorEmbedMock).toHaveBeenCalledWith(
            'Error',
            'This command can only be used in a server.',
        )
        expect(interactionReplyMock).toHaveBeenCalled()
    })

    it('returns health report with queue and snapshot data', async () => {
        const queue = {
            node: { isPlaying: () => true },
            tracks: { size: 2 },
            repeatMode: 3,
        }
        const client = createClient(queue)
        getSnapshotMock.mockResolvedValue({
            sessionSnapshotId: 'snap-1',
            savedAt: 10,
            upcomingTracks: [{}, {}],
        })
        resolveGuildQueueMock.mockReturnValue({
            queue,
            source: 'cache.id',
            diagnostics: {
                guildId: 'guild-1',
                cacheSize: 2,
                cacheSampleKeys: ['guild-2', 'guild-1'],
            },
        })

        await musicCommand.execute({
            client,
            interaction: createInteraction(),
        } as any)

        expect(resolveGuildQueueMock).toHaveBeenCalledWith(client, 'guild-1')
        expect(createEmbedMock).toHaveBeenCalledWith(
            expect.objectContaining({
                title: expect.stringContaining('Music Health'),
                fields: expect.arrayContaining([
                    expect.objectContaining({ name: 'Queue state' }),
                    expect.objectContaining({ name: 'Provider health' }),
                    expect.objectContaining({ name: 'Watchdog' }),
                    expect.objectContaining({ name: 'Session snapshot' }),
                ]),
            }),
        )
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({ ephemeral: true }),
            }),
        )
    })
})
