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
}))

const getGuildSettingsMock = jest.fn()
const updateGuildSettingsMock = jest.fn()

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
}))

function createInteraction(subcommand = 'skip') {
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
        },
    }

    return interaction as any
}

function createQueue() {
    return {
        guild: { id: 'guild-1' },
        currentTrack: { title: 'Current Song' },
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

    describe('skip subcommand', () => {
        it('should skip first autoplay track and replenish', async () => {
            const interaction = createInteraction('skip')
            const queue = createQueue()
            const client = createClient()

            resolveGuildQueueMock.mockReturnValue({ queue })
            replenishQueueMock.mockResolvedValue(undefined)

            await autoplayCommand.execute({ client, interaction } as any)

            expect(interaction.deferReply).toHaveBeenCalled()
            expect(queue.removeTrack).toHaveBeenCalledWith(0)
            expect(replenishQueueMock).toHaveBeenCalledWith(queue)
            expect(interactionReplyMock).toHaveBeenCalled()
        })

        it('should handle empty queue gracefully', async () => {
            const interaction = createInteraction('skip')
            const queue = createQueue()
            queue.tracks.size = 0
            const client = createClient()

            resolveGuildQueueMock.mockReturnValue({ queue })

            await autoplayCommand.execute({ client, interaction } as any)

            expect(createErrorEmbedMock).toHaveBeenCalledWith(
                'Queue Empty',
                expect.anything(),
            )
        })
    })

    describe('clear subcommand', () => {
        it('should remove all autoplay tracks and replenish', async () => {
            const interaction = createInteraction('clear')
            const queue = createQueue()
            const client = createClient()

            resolveGuildQueueMock.mockReturnValue({ queue })
            replenishQueueMock.mockResolvedValue(undefined)

            await autoplayCommand.execute({ client, interaction } as any)

            expect(queue.removeTrack).toHaveBeenCalledTimes(2)
            expect(replenishQueueMock).toHaveBeenCalledWith(queue)
            expect(interactionReplyMock).toHaveBeenCalled()
        })

        it('should handle no autoplay tracks gracefully', async () => {
            const interaction = createInteraction('clear')
            const queue = createQueue()
            queue.tracks.at = jest.fn(() => ({
                metadata: { isAutoplay: false },
            }))
            const client = createClient()

            resolveGuildQueueMock.mockReturnValue({ queue })

            await autoplayCommand.execute({ client, interaction } as any)

            expect(createErrorEmbedMock).toHaveBeenCalledWith(
                'No Autoplay Tracks',
                expect.anything(),
            )
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
    })

    describe('error handling', () => {
        it('should handle unknown interaction error gracefully', async () => {
            const interaction = createInteraction('skip')
            const error = { code: 10062 }
            interaction.deferReply = jest.fn(async () => {
                throw error
            })
            const client = createClient()

            resolveGuildQueueMock.mockReturnValue({ queue: null })

            await autoplayCommand.execute({ client, interaction } as any)

            expect(interactionReplyMock).not.toHaveBeenCalled()
        })

        it('should reply with error when no queue exists', async () => {
            const interaction = createInteraction('skip')
            const client = createClient()

            resolveGuildQueueMock.mockReturnValue({ queue: null })

            await autoplayCommand.execute({ client, interaction } as any)

            expect(createErrorEmbedMock).toHaveBeenCalledWith(
                'No Active Queue',
                expect.anything(),
            )
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

        it('should handle service errors gracefully', async () => {
            const interaction = createInteraction('analytics')
            const client = createClient()

            resolveGuildQueueMock.mockReturnValue({ queue: null })
            trackHistoryServiceMock.mockRejectedValue(
                new Error('Service error'),
            )

            await autoplayCommand.execute({ client, interaction } as any)

            expect(createErrorEmbedMock).toHaveBeenCalledWith(
                'Error',
                expect.anything(),
            )
            expect(interactionReplyMock).toHaveBeenCalled()
        })
    })

    describe('mode subcommand', () => {
        it('should show current mode when no mode argument provided', async () => {
            const interaction = createInteraction('mode')
            interaction.options.getString = jest.fn().mockReturnValue(null)
            const client = createClient()

            resolveGuildQueueMock.mockReturnValue({ queue: null })
            getGuildSettingsMock.mockResolvedValue({
                autoplayMode: 'discover',
            })

            await autoplayCommand.execute({ client, interaction } as any)

            expect(getGuildSettingsMock).toHaveBeenCalledWith('guild-1')
            expect(interactionReplyMock).toHaveBeenCalled()
            expect(createEmbedMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    description: expect.stringContaining('discover'),
                }),
            )
        })

        it('should show default mode when settings return null', async () => {
            const interaction = createInteraction('mode')
            interaction.options.getString = jest.fn().mockReturnValue(null)
            const client = createClient()

            resolveGuildQueueMock.mockReturnValue({ queue: null })
            getGuildSettingsMock.mockResolvedValue({})

            await autoplayCommand.execute({ client, interaction } as any)

            expect(interactionReplyMock).toHaveBeenCalled()
            expect(createEmbedMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    description: expect.stringContaining('similar'),
                }),
            )
        })

        it('should update mode when mode argument provided', async () => {
            const interaction = createInteraction('mode')
            interaction.options.getString = jest.fn().mockReturnValue('popular')
            const client = createClient()

            resolveGuildQueueMock.mockReturnValue({ queue: null })
            updateGuildSettingsMock.mockResolvedValue(true)

            await autoplayCommand.execute({ client, interaction } as any)

            expect(updateGuildSettingsMock).toHaveBeenCalledWith('guild-1', {
                autoplayMode: 'popular',
            })
            expect(interactionReplyMock).toHaveBeenCalled()
            expect(createEmbedMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: expect.stringContaining('mode updated'),
                }),
            )
        })

        it('should show error when mode update fails', async () => {
            const interaction = createInteraction('mode')
            interaction.options.getString = jest
                .fn()
                .mockReturnValue('discover')
            const client = createClient()

            resolveGuildQueueMock.mockReturnValue({ queue: null })
            updateGuildSettingsMock.mockResolvedValue(false)

            await autoplayCommand.execute({ client, interaction } as any)

            expect(createErrorEmbedMock).toHaveBeenCalledWith(
                'Error',
                'Failed to update autoplay mode.',
            )
            expect(interactionReplyMock).toHaveBeenCalled()
        })
    })

    describe('skip subcommand edge cases', () => {
        it('should show error when no autoplay tracks found in queue', async () => {
            const interaction = createInteraction('skip')
            const queue = createQueue()
            queue.tracks.at = jest.fn(() => ({
                metadata: { isAutoplay: false },
                title: 'Manual Track',
            }))
            queue.tracks.size = 1
            const client = createClient()

            resolveGuildQueueMock.mockReturnValue({ queue })

            await autoplayCommand.execute({ client, interaction } as any)

            expect(createErrorEmbedMock).toHaveBeenCalledWith(
                'No Autoplay Tracks',
                'No autoplay tracks found in queue.',
            )
            expect(queue.removeTrack).not.toHaveBeenCalled()
            expect(interactionReplyMock).toHaveBeenCalled()
        })
    })

    describe('execute function edge cases', () => {
        it('should return early when guildId is null', async () => {
            const interaction = createInteraction('skip')
            interaction.guildId = null
            const client = createClient()

            const result = await autoplayCommand.execute({
                client,
                interaction,
            } as any)

            expect(resolveGuildQueueMock).not.toHaveBeenCalled()
            expect(result).toBeUndefined()
        })

        it('should handle unknown subcommand', async () => {
            const interaction = createInteraction('unknown')
            interaction.options.getSubcommand = jest
                .fn()
                .mockReturnValue('unknown')
            const client = createClient()

            resolveGuildQueueMock.mockReturnValue({ queue: null })

            await autoplayCommand.execute({ client, interaction } as any)

            expect(createErrorEmbedMock).toHaveBeenCalledWith(
                'Unknown Subcommand',
                'Please use skip, clear, status, analytics, mode, or artist.',
            )
            expect(interactionReplyMock).toHaveBeenCalled()
        })
    })
})
