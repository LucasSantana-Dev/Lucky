import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import musicCommand from './music'

const interactionReplyMock = jest.fn()
const createEmbedMock = jest.fn((payload: unknown) => payload)
const createErrorEmbedMock = jest.fn((title: string, message: string) => ({
    type: 'error',
    title,
    message,
}))
const createSuccessEmbedMock = jest.fn((title: string, message: string) => ({
    type: 'success',
    title,
    message,
}))
const requireGuildMock = jest.fn()
const getAllStatusesMock = jest.fn()
const getGuildStateMock = jest.fn()
const getSnapshotMock = jest.fn()
const resolveGuildQueueMock = jest.fn()
const getFeedbackCountsMock = jest.fn()
const clearFeedbackMock = jest.fn()

jest.mock('../../../services/musicRecommendation/feedbackService', () => ({
    recommendationFeedbackService: {
        getFeedbackCounts: (...args: unknown[]) =>
            getFeedbackCountsMock(...args),
        clearFeedback: (...args: unknown[]) => clearFeedbackMock(...args),
    },
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createEmbed: (...args: unknown[]) => createEmbedMock(...args),
    createErrorEmbed: (...args: unknown[]) => createErrorEmbedMock(...args),
    createSuccessEmbed: (...args: unknown[]) => createSuccessEmbedMock(...args),
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
        user: { id: 'user-1' },
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
            lastRecoveryAt: null,
            lastRecoveryDetail: null,
        })
        getSnapshotMock.mockResolvedValue(null)
        getFeedbackCountsMock.mockResolvedValue({ liked: 0, disliked: 0 })
        clearFeedbackMock.mockResolvedValue(undefined)
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

        expect(createErrorEmbedMock).toHaveBeenCalledWith(
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

        expect(createErrorEmbedMock).toHaveBeenCalledWith(
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

    it('includes resolver diagnostics and actionable next steps', async () => {
        getAllStatusesMock.mockReturnValue({
            youtube: {
                provider: 'youtube',
                score: 0.4,
                cooldownUntil: 1000,
                consecutiveFailures: 3,
            },
        })
        getGuildStateMock.mockReturnValue({
            timeoutMs: 25000,
            lastRecoveryAction: 'failed',
            lastActivityAt: 0,
            lastRecoveryAt: 0,
            lastRecoveryDetail: 'connection_not_ready_after_rejoin',
        })
        getSnapshotMock.mockResolvedValue(null)
        resolveGuildQueueMock.mockReturnValue({
            queue: null,
            source: 'miss',
            diagnostics: {
                guildId: 'guild-1',
                cacheSize: 2,
                cacheSampleKeys: ['guild-9', 'guild-3'],
            },
        })

        await musicCommand.execute({
            client: createClient(),
            interaction: createInteraction(),
        } as any)

        expect(createEmbedMock).toHaveBeenCalledWith(
            expect.objectContaining({
                fields: expect.arrayContaining([
                    expect.objectContaining({ name: 'Resolver diagnostics' }),
                    expect.objectContaining({ name: 'Actionable next steps' }),
                ]),
            }),
        )

        const payload = createEmbedMock.mock.calls.at(-1)?.[0] as {
            fields: Array<{ name: string; value: string }>
        }
        const actionField = payload.fields.find(
            (field) => field.name === 'Actionable next steps',
        )
        const resolverField = payload.fields.find(
            (field) => field.name === 'Resolver diagnostics',
        )

        expect(actionField?.value).toContain('/play')
        expect(actionField?.value).toContain('/session save')
        expect(actionField?.value).toContain('Providers on cooldown')
        expect(resolverField?.value).toContain('Source: miss')
        expect(resolverField?.value).toContain('Cache size: 2')
        expect(resolverField?.value).toContain('guild-9, guild-3')

        const watchdogField = payload.fields.find(
            (field) => field.name === 'Watchdog',
        )
        expect(watchdogField?.value).toContain(
            'Last recovery detail: connection_not_ready_after_rejoin',
        )
    })

    it('formats repeat mode label and watchdog recovery timestamp', async () => {
        const queue = {
            node: { isPlaying: () => false },
            tracks: { size: 1 },
            repeatMode: 3,
        }
        resolveGuildQueueMock.mockReturnValue({
            queue,
            source: 'cache.id',
            diagnostics: {
                guildId: 'guild-1',
                cacheSize: 1,
                cacheSampleKeys: ['guild-1'],
            },
        })
        getGuildStateMock.mockReturnValue({
            timeoutMs: 25000,
            lastRecoveryAction: 'play_next',
            lastActivityAt: 10,
            lastRecoveryAt: 20,
            lastRecoveryDetail: 'started_next_track',
        })

        await musicCommand.execute({
            client: createClient(queue),
            interaction: createInteraction(),
        } as any)

        const payload = createEmbedMock.mock.calls.at(-1)?.[0] as {
            fields: Array<{ name: string; value: string }>
        }
        const queueField = payload.fields.find(
            (field) => field.name === 'Queue state',
        )
        const watchdogField = payload.fields.find(
            (field) => field.name === 'Watchdog',
        )

        expect(queueField?.value).toContain('Repeat mode: autoplay')
        expect(watchdogField?.value).toContain('Last recovery at:')
        expect(watchdogField?.value).toContain(
            'Last recovery detail: started_next_track',
        )
    })

    it('shows liked and disliked counts in recommendation feedback field', async () => {
        getFeedbackCountsMock.mockResolvedValue({ liked: 3, disliked: 2 })

        await musicCommand.execute({
            client: createClient(),
            interaction: createInteraction(),
        } as any)

        const payload = createEmbedMock.mock.calls.at(-1)?.[0] as {
            fields: Array<{ name: string; value: string }>
        }
        const feedbackField = payload.fields.find(
            (field) => field.name === 'Recommendation feedback',
        )

        expect(feedbackField).toBeDefined()
        expect(feedbackField?.value).toContain('Liked: 3')
        expect(feedbackField?.value).toContain('Disliked: 2')
        expect(getFeedbackCountsMock).toHaveBeenCalledWith('user-1')
    })

    it('shows no-feedback message when counts are zero', async () => {
        getFeedbackCountsMock.mockResolvedValue({ liked: 0, disliked: 0 })

        await musicCommand.execute({
            client: createClient(),
            interaction: createInteraction(),
        } as any)

        const payload = createEmbedMock.mock.calls.at(-1)?.[0] as {
            fields: Array<{ name: string; value: string }>
        }
        const feedbackField = payload.fields.find(
            (field) => field.name === 'Recommendation feedback',
        )

        expect(feedbackField?.value).toContain('/recommendation feedback')
    })

    it('clearfeedback subcommand clears user feedback and replies with success', async () => {
        await musicCommand.execute({
            client: createClient(),
            interaction: createInteraction('clearfeedback'),
        } as any)

        expect(clearFeedbackMock).toHaveBeenCalledWith('user-1')
        expect(createSuccessEmbedMock).toHaveBeenCalledWith(
            'Feedback cleared',
            expect.stringContaining('cleared'),
        )
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({ ephemeral: true }),
            }),
        )
    })

    it('clearfeedback does not call health lookup methods', async () => {
        await musicCommand.execute({
            client: createClient(),
            interaction: createInteraction('clearfeedback'),
        } as any)

        expect(getFeedbackCountsMock).not.toHaveBeenCalled()
        expect(getAllStatusesMock).not.toHaveBeenCalled()
        expect(getSnapshotMock).not.toHaveBeenCalled()
    })
})
