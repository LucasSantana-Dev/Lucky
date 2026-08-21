import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const requireGuildMock = jest.fn<() => Promise<boolean>>()
const clearFeedbackMock = jest.fn<() => Promise<void>>()
const getFeedbackCountsMock = jest.fn<() => Promise<unknown>>()
const resolveGuildQueueMock = jest.fn()
const getGuildStateMock = jest.fn()
const getSnapshotMock = jest.fn<() => Promise<unknown>>()
const getAllStatusesMock = jest.fn()

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: jest.fn(),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createEmbed: jest.fn((opts: unknown) => opts),
    EMBED_COLORS: { INFO: 1, PRIMARY: 2 },
    EMOJIS: {},
    createErrorEmbed: jest.fn((title: string, description?: string) => ({
        title,
        description,
    })),
    createSuccessEmbed: jest.fn((title: string, description?: string) => ({
        title,
        description,
    })),
}))

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: (...a: unknown[]) => requireGuildMock(...(a as [])),
}))

jest.mock('../../../utils/music/search/providerHealth', () => ({
    providerHealthService: { getAllStatuses: () => getAllStatusesMock() },
}))

jest.mock('../../../services/musicManagement/watchdog', () => ({
    musicWatchdogService: {
        getGuildState: (...a: unknown[]) => getGuildStateMock(...(a as [])),
    },
}))

jest.mock('../../../services/musicRecommendation/sessionSnapshots', () => ({
    musicSessionSnapshotService: { getSnapshot: () => getSnapshotMock() },
}))

jest.mock('../../../services/musicManagement/queueResolver', () => ({
    resolveGuildQueue: (...a: unknown[]) => resolveGuildQueueMock(...(a as [])),
}))

jest.mock('../../../services/musicRecommendation/feedbackService', () => ({
    recommendationFeedbackService: {
        clearFeedback: (...a: unknown[]) => clearFeedbackMock(...(a as [])),
        getFeedbackCounts: () => getFeedbackCountsMock(),
    },
}))

import musicCommand from './music'
import { interactionReply } from '../../../utils/general/interactionReply'

const reply = () =>
    (interactionReply as jest.Mock).mock.calls.at(-1)?.[0] as {
        content: {
            embeds: {
                title?: string
                description?: string
                fields?: unknown[]
            }[]
            ephemeral?: boolean
        }
    }

const createInteraction = (
    subcommand: string,
    guildId: string | null = 'g1',
) => ({
    guildId,
    user: { id: 'u1' },
    options: { getSubcommand: () => subcommand },
})

const createQueue = (overrides: Record<string, unknown> = {}) => ({
    node: { isPlaying: () => true },
    tracks: { size: 3 },
    repeatMode: 0,
    ...overrides,
})

describe('music command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireGuildMock.mockResolvedValue(true)
        getFeedbackCountsMock.mockResolvedValue({ liked: 0, disliked: 0 })
        getSnapshotMock.mockResolvedValue(null)
        getAllStatusesMock.mockReturnValue({})
        // getGuildState() calls ensureState(), so it always returns a state
        // object — never null. Mocking null gave a false failure.
        getGuildStateMock.mockReturnValue({
            guildId: 'g1',
            timeoutMs: 300_000,
            lastActivityAt: null,
            lastRecoveryAt: null,
            lastRecoveryAction: 'none',
            lastRecoveryDetail: null,
        })
        resolveGuildQueueMock.mockReturnValue({
            queue: createQueue(),
            source: 'cache',
            diagnostics: { cacheSize: 1, cacheSampleKeys: ['g1'] },
        })
    })

    it('has the expected command shape', () => {
        expect(musicCommand.data.name).toBe('music')
        expect(musicCommand.category).toBe('music')
        const names = musicCommand.data.options.map(
            (o: { name: string }) => o.name,
        )
        expect(names).toEqual(
            expect.arrayContaining(['health', 'clearfeedback']),
        )
    })

    it('returns early when the guild guard fails', async () => {
        requireGuildMock.mockResolvedValue(false)

        await musicCommand.execute({
            client: {},
            interaction: createInteraction('health'),
        } as never)

        expect(interactionReply).not.toHaveBeenCalled()
        expect(resolveGuildQueueMock).not.toHaveBeenCalled()
    })

    it('clearfeedback clears the caller feedback and confirms ephemerally', async () => {
        await musicCommand.execute({
            client: {},
            interaction: createInteraction('clearfeedback'),
        } as never)

        expect(clearFeedbackMock).toHaveBeenCalledWith('u1')
        expect(reply().content.ephemeral).toBe(true)
        expect(reply().content.embeds[0].title).toBe('Feedback cleared')
        // Must not fall through into the health branch.
        expect(resolveGuildQueueMock).not.toHaveBeenCalled()
    })

    it('rejects an unknown subcommand instead of treating it as health', async () => {
        await musicCommand.execute({
            client: {},
            interaction: createInteraction('bogus'),
        } as never)

        expect(reply().content.embeds[0].description).toBe(
            'Unknown subcommand.',
        )
        expect(resolveGuildQueueMock).not.toHaveBeenCalled()
    })

    it('health reports diagnostics for an active queue', async () => {
        await musicCommand.execute({
            client: {},
            interaction: createInteraction('health'),
        } as never)

        expect(resolveGuildQueueMock).toHaveBeenCalledWith({}, 'g1')
        const body = JSON.stringify(reply().content.embeds[0])
        expect(body).toContain('Playing: yes')
        expect(body).toContain('Tracks in queue: 3')
        expect(body).toContain('Repeat mode: off')
    })

    it('health survives having no active queue', async () => {
        resolveGuildQueueMock.mockReturnValue({
            queue: null,
            source: 'miss',
            diagnostics: { cacheSize: 0, cacheSampleKeys: [] },
        })

        await musicCommand.execute({
            client: {},
            interaction: createInteraction('health'),
        } as never)

        const body = JSON.stringify(reply().content.embeds[0])
        expect(body).toContain('No active queue')
        expect(body).toContain('Cache keys: none')
    })

    it('health renders provider statuses ordered by score', async () => {
        getAllStatusesMock.mockReturnValue({
            soundcloud: {
                provider: 'soundcloud',
                score: 0.4,
                consecutiveFailures: 2,
                cooldownUntil: Date.now(),
            },
            youtube: {
                provider: 'youtube',
                score: 0.9,
                consecutiveFailures: 0,
                cooldownUntil: null,
            },
        })

        await musicCommand.execute({
            client: {},
            interaction: createInteraction('health'),
        } as never)

        const body = JSON.stringify(reply().content.embeds[0])
        expect(body).toContain('youtube: 90% (ready, failures: 0)')
        expect(body).toContain('soundcloud: 40% (cooldown, failures: 2)')
        expect(body.indexOf('youtube: 90%')).toBeLessThan(
            body.indexOf('soundcloud: 40%'),
        )
    })

    it('health surfaces a failed watchdog recovery with its detail', async () => {
        getGuildStateMock.mockReturnValue({
            guildId: 'g1',
            timeoutMs: 300_000,
            lastActivityAt: null,
            lastRecoveryAt: Date.now(),
            lastRecoveryAction: 'failed',
            lastRecoveryDetail: 'stream stalled',
        })

        await musicCommand.execute({
            client: {},
            interaction: createInteraction('health'),
        } as never)

        const body = JSON.stringify(reply().content.embeds[0])
        expect(body).toContain('Last watchdog recovery failed')
        expect(body).toContain('stream stalled')
    })

    it('health reports the no-data case rather than an empty provider list', async () => {
        getAllStatusesMock.mockReturnValue({})

        await musicCommand.execute({
            client: {},
            interaction: createInteraction('health'),
        } as never)

        expect(JSON.stringify(reply().content.embeds[0])).toContain(
            'No provider status data collected yet.',
        )
    })
})
