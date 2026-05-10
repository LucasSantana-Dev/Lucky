import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import autoplayCommand from './autoplay'

const interactionReplyMock = jest.fn()
const createEmbedMock = jest.fn((payload: unknown) => payload)
const createErrorEmbedMock = jest.fn((title: string, desc: string) => ({
    title,
    description: desc,
}))
const replenishQueueMock = jest.fn()
const debugLogMock = jest.fn()
const errorLogMock = jest.fn()
const resolveGuildQueueMock = jest.fn()
const trackHistoryServiceMock = jest.fn()
const setArtistFeedbackMock = jest.fn()
const removeArtistFeedbackMock = jest.fn()
const getArtistFeedbackSummaryMock = jest.fn()

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

jest.mock('../../../utils/music/queueOperations', () => ({
    replenishQueue: (...args: unknown[]) => replenishQueueMock(...args),
}))

jest.mock('../../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

const getGuildSettingsMock = jest.fn()
const updateGuildSettingsMock = jest.fn()
const getLastFmLinkMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    guildSettingsService: {
        getGuildSettings: (...args: unknown[]) => getGuildSettingsMock(...args),
        updateGuildSettings: (...args: unknown[]) =>
            updateGuildSettingsMock(...args),
    },
    trackHistoryService: {
        getAutoplayStats: (...args: unknown[]) =>
            trackHistoryServiceMock(...args),
    },
    lastFmLinkService: {
        getByDiscordId: (...args: unknown[]) => getLastFmLinkMock(...args),
    },
}))

jest.mock('../../../services/musicRecommendation/feedbackService', () => ({
    recommendationFeedbackService: {
        setArtistFeedback: (...args: unknown[]) =>
            setArtistFeedbackMock(...args),
        removeArtistFeedback: (...args: unknown[]) =>
            removeArtistFeedbackMock(...args),
        getArtistFeedbackSummary: (...args: unknown[]) =>
            getArtistFeedbackSummaryMock(...args),
    },
}))

function createInteraction(
    subcommand = 'skip',
    subcommandGroup: string | null = null,
) {
    const interaction = {
        guildId: 'guild-1',
        deferred: false,
        replied: false,
        user: { id: 'user-1' },
        deferReply: jest.fn(async () => {
            interaction.deferred = true
        }),
        options: {
            getSubcommand: jest.fn(() => subcommand),
            getSubcommandGroup: jest.fn(() => subcommandGroup),
        },
    }

    return interaction as any
}

function createQueue(metadata: Record<string, unknown> = {}) {
    return {
        guild: { id: 'guild-1' },
        currentTrack: { title: 'Current Song' },
        metadata,
        tracks: {
            size: 3,
            at: jest.fn((index: number) => {
                if (index === 0)
                    return {
                        metadata: { isAutoplay: true },
                        title: 'Autoplay 1',
                    }
                if (index === 1)
                    return { metadata: { isAutoplay: false }, title: 'Manual' }
                if (index === 2)
                    return {
                        metadata: { isAutoplay: true },
                        title: 'Autoplay 2',
                    }
                return null
            }),
        },
        removeTrack: jest.fn(),
    } as any
}

function createClient() {
    return {
        user: { id: 'bot-1' },
    } as any
}

describe('autoplay command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        getGuildSettingsMock.mockResolvedValue({ autoplayMode: 'similar' })
        updateGuildSettingsMock.mockResolvedValue(true)
        getLastFmLinkMock.mockResolvedValue(null)
    })

    describe('structure', () => {
        it('should have correct name and description', () => {
            expect(autoplayCommand.data.name).toBe('autoplay')
            expect(autoplayCommand.data.description).toContain(
                'Manage autoplay',
            )
        })

        it('should have three subcommands', () => {
            const builder = autoplayCommand.data
            const options = (builder as any).options || []
            expect(options.length).toBeGreaterThanOrEqual(3)
        })
    })



    describe('status subcommand', () => {
        it('should show autoplay status', async () => {
            const interaction = createInteraction('status')
            const queue = createQueue()
            const client = createClient()

            resolveGuildQueueMock.mockReturnValue({ queue })

            await autoplayCommand.execute({ client, interaction } as any)

            expect(createEmbedMock).toHaveBeenCalled()
            const embed = createEmbedMock.mock.calls[0][0]
            expect(embed.title).toContain('Status')
            expect(interactionReplyMock).toHaveBeenCalled()
        })


        it('should not show blend when only one member has last.fm', async () => {
            getLastFmLinkMock
                .mockResolvedValueOnce({ lastFmUsername: 'user1' })
                .mockResolvedValueOnce(null)
            const interaction = createInteraction('status')
            const queue = createQueue({ vcMemberIds: ['user-1', 'user-2'] })
            const client = createClient()

            resolveGuildQueueMock.mockReturnValue({ queue })

            await autoplayCommand.execute({ client, interaction } as any)

            const callArgs = createEmbedMock.mock.calls[0][0] as {
                fields: Array<{ name: string }>
            }
            const blendField = callArgs.fields?.find(
                (f) => f.name === '🎭 Blend',
            )
            expect(blendField).toBeUndefined()
        })
    })


    describe('analytics subcommand', () => {
        it('should show autoplay analytics with data', async () => {
            const interaction = createInteraction('analytics')
            const client = createClient()

            resolveGuildQueueMock.mockReturnValue({ queue: null })
            trackHistoryServiceMock.mockResolvedValue({
                total: 100,
                autoplayCount: 30,
                autoplayPercent: 30,
                topAutoplayArtists: [
                    { artist: 'The Beatles', count: 10 },
                    { artist: 'Pink Floyd', count: 8 },
                ],
            })

            await autoplayCommand.execute({ client, interaction } as any)

            expect(trackHistoryServiceMock).toHaveBeenCalledWith('guild-1', 200)
            expect(createEmbedMock).toHaveBeenCalled()
            const embed = createEmbedMock.mock.calls[0][0]
            expect(embed.title).toContain('Analytics')
            expect(embed.description).toContain('100 tracks')
            expect(embed.description).toContain('30 (30%)')
            expect(interactionReplyMock).toHaveBeenCalled()
        })

        it('should handle empty history gracefully', async () => {
            const interaction = createInteraction('analytics')
            const client = createClient()

            resolveGuildQueueMock.mockReturnValue({ queue: null })
            trackHistoryServiceMock.mockResolvedValue({
                total: 0,
                autoplayCount: 0,
                autoplayPercent: 0,
                topAutoplayArtists: [],
            })

            await autoplayCommand.execute({ client, interaction } as any)

            expect(createEmbedMock).toHaveBeenCalled()
            const embed = createEmbedMock.mock.calls[0][0]
            expect(embed.description).toContain('No play history yet')
            expect(interactionReplyMock).toHaveBeenCalled()
        })

    })





})
