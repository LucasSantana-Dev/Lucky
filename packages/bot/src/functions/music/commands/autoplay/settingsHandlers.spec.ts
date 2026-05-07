import { jest } from '@jest/globals'
import type { ChatInputCommandInteraction } from 'discord.js'

const mockInteractionReply = jest.fn().mockResolvedValue(undefined)
const mockCreateEmbed = jest.fn().mockReturnValue({ type: 'embed' })
const mockCreateErrorEmbed = jest.fn().mockReturnValue({ type: 'error-embed' })
const mockGetGuildSettings = jest.fn()
const mockUpdateGuildSettings = jest.fn()
const mockGetAutoplayStats = jest.fn()

jest.mock('../../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => mockInteractionReply(...args),
}))

jest.mock('../../../../utils/general/embeds', () => ({
    createEmbed: (...args: unknown[]) => mockCreateEmbed(...args),
    createErrorEmbed: (...args: unknown[]) => mockCreateErrorEmbed(...args),
    EMBED_COLORS: { AUTOPLAY: '#7289DA', ERROR: '#FF0000' },
    EMOJIS: { AUTOPLAY: '📻' },
}))

jest.mock('@lucky/shared/services', () => ({
    guildSettingsService: {
        getGuildSettings: (...args: unknown[]) => mockGetGuildSettings(...args),
        updateGuildSettings: (...args: unknown[]) => mockUpdateGuildSettings(...args),
    },
    trackHistoryService: {
        getAutoplayStats: (...args: unknown[]) => mockGetAutoplayStats(...args),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
}))

import {
    handleAutoplayMode,
    handleAutoplayGenre,
    handleAutoplayAnalytics,
} from './settingsHandlers'

function makeInteraction(overrides: object = {}): ChatInputCommandInteraction {
    return {
        guildId: 'guild-123',
        user: { id: 'user-1' },
        options: {
            getString: jest.fn().mockReturnValue(null),
            getSubcommand: jest.fn().mockReturnValue(null),
        },
        ...overrides,
    } as unknown as ChatInputCommandInteraction
}

describe('handleAutoplayMode', () => {
    const baseInteraction = makeInteraction()

    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('returns error when guildId is missing', async () => {
        const interaction = makeInteraction({ guildId: null })
        mockCreateErrorEmbed.mockReturnValueOnce({ type: 'error' })

        await handleAutoplayMode(interaction)

        expect(mockCreateErrorEmbed).toHaveBeenCalledWith(
            'Guild Not Found',
            'Unable to retrieve guild information.',
        )
        expect(mockInteractionReply).toHaveBeenCalled()
    })

    it('shows current mode when no mode parameter provided', async () => {
        mockGetGuildSettings.mockResolvedValueOnce({
            autoplayMode: 'discover',
        })
        mockCreateEmbed.mockReturnValueOnce({ type: 'embed' })

        await handleAutoplayMode(baseInteraction)

        expect(mockGetGuildSettings).toHaveBeenCalledWith('guild-123')
        expect(mockCreateEmbed).toHaveBeenCalledWith(
            expect.objectContaining({
                title: '🎚️ Autoplay Mode',
                description: expect.stringContaining('discover'),
            }),
        )
    })

    it('defaults to similar mode when no settings exist', async () => {
        mockGetGuildSettings.mockResolvedValueOnce(null)
        mockCreateEmbed.mockReturnValueOnce({ type: 'embed' })

        await handleAutoplayMode(baseInteraction)

        expect(mockCreateEmbed).toHaveBeenCalledWith(
            expect.objectContaining({
                description: expect.stringContaining('similar'),
            }),
        )
    })

    it('updates mode when mode parameter provided', async () => {
        const interaction = makeInteraction({
            options: {
                getString: jest.fn().mockReturnValue('popular'),
            },
        })
        mockUpdateGuildSettings.mockResolvedValueOnce(true)
        mockCreateEmbed.mockReturnValueOnce({ type: 'embed' })

        await handleAutoplayMode(interaction)

        expect(mockUpdateGuildSettings).toHaveBeenCalledWith('guild-123', {
            autoplayMode: 'popular',
        })
        expect(mockCreateEmbed).toHaveBeenCalledWith(
            expect.objectContaining({
                title: '✅ Autoplay mode updated',
            }),
        )
    })

    it('shows error when update fails', async () => {
        const interaction = makeInteraction({
            options: {
                getString: jest.fn().mockReturnValue('similar'),
            },
        })
        mockUpdateGuildSettings.mockResolvedValueOnce(false)
        mockCreateErrorEmbed.mockReturnValueOnce({ type: 'error' })

        await handleAutoplayMode(interaction)

        expect(mockCreateErrorEmbed).toHaveBeenCalledWith(
            'Error',
            'Failed to update autoplay mode.',
        )
    })
})

describe('handleAutoplayGenre', () => {
    const baseInteraction = makeInteraction()

    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('add subcommand', () => {
        it('returns error when guildId is missing', async () => {
            const interaction = makeInteraction({ guildId: null })
            mockCreateErrorEmbed.mockReturnValueOnce({ type: 'error' })

            await handleAutoplayGenre(interaction, 'add')

            expect(mockCreateErrorEmbed).toHaveBeenCalledWith(
                'Guild Not Found',
                'Unable to retrieve guild information.',
            )
        })

        it('returns error when tag is not provided', async () => {
            const interaction = makeInteraction({
                options: {
                    getString: jest.fn().mockReturnValue(null),
                },
            })
            mockCreateErrorEmbed.mockReturnValueOnce({ type: 'error' })

            await handleAutoplayGenre(interaction, 'add')

            expect(mockCreateErrorEmbed).toHaveBeenCalledWith(
                'Missing Tag',
                'Please provide a genre tag.',
            )
        })

        it('returns error when max genres reached', async () => {
            const interaction = makeInteraction({
                options: {
                    getString: jest.fn().mockReturnValue('pop'),
                },
            })
            mockGetGuildSettings.mockResolvedValueOnce({
                autoplayGenres: ['rock', 'jazz', 'pop', 'metal', 'classical'],
            })
            mockCreateErrorEmbed.mockReturnValueOnce({ type: 'error' })

            await handleAutoplayGenre(interaction, 'add')

            expect(mockCreateErrorEmbed).toHaveBeenCalledWith(
                'Limit Reached',
                'Maximum 5 genres allowed per guild.',
            )
        })

        it('returns error when genre already exists', async () => {
            const interaction = makeInteraction({
                options: {
                    getString: jest.fn().mockReturnValue('rock'),
                },
            })
            mockGetGuildSettings.mockResolvedValueOnce({
                autoplayGenres: ['rock', 'jazz'],
            })
            mockCreateErrorEmbed.mockReturnValueOnce({ type: 'error' })

            await handleAutoplayGenre(interaction, 'add')

            expect(mockCreateErrorEmbed).toHaveBeenCalledWith(
                'Already Added',
                'Genre **rock** is already in your list.',
            )
        })

        it('adds genre successfully', async () => {
            const interaction = makeInteraction({
                options: {
                    getString: jest.fn().mockReturnValue('pop'),
                },
            })
            mockGetGuildSettings.mockResolvedValueOnce({
                autoplayGenres: ['rock'],
            })
            mockUpdateGuildSettings.mockResolvedValueOnce(true)
            mockCreateEmbed.mockReturnValueOnce({ type: 'embed' })

            await handleAutoplayGenre(interaction, 'add')

            expect(mockUpdateGuildSettings).toHaveBeenCalledWith('guild-123', {
                autoplayGenres: ['rock', 'pop'],
            })
            expect(mockCreateEmbed).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: '✅ Genre added',
                }),
            )
        })

        it('shows error when update fails', async () => {
            const interaction = makeInteraction({
                options: {
                    getString: jest.fn().mockReturnValue('pop'),
                },
            })
            mockGetGuildSettings.mockResolvedValueOnce({
                autoplayGenres: [],
            })
            mockUpdateGuildSettings.mockResolvedValueOnce(false)
            mockCreateErrorEmbed.mockReturnValueOnce({ type: 'error' })

            await handleAutoplayGenre(interaction, 'add')

            expect(mockCreateErrorEmbed).toHaveBeenCalledWith(
                'Error',
                'Failed to add genre.',
            )
        })
    })

    describe('remove subcommand', () => {
        it('returns error when guildId is missing', async () => {
            const interaction = makeInteraction({ guildId: null })
            mockCreateErrorEmbed.mockReturnValueOnce({ type: 'error' })

            await handleAutoplayGenre(interaction, 'remove')

            expect(mockCreateErrorEmbed).toHaveBeenCalledWith(
                'Guild Not Found',
                'Unable to retrieve guild information.',
            )
        })

        it('returns error when tag is not provided', async () => {
            const interaction = makeInteraction({
                options: {
                    getString: jest.fn().mockReturnValue(null),
                },
            })
            mockCreateErrorEmbed.mockReturnValueOnce({ type: 'error' })

            await handleAutoplayGenre(interaction, 'remove')

            expect(mockCreateErrorEmbed).toHaveBeenCalledWith(
                'Missing Tag',
                'Please provide a genre tag.',
            )
        })

        it('returns error when genre not found', async () => {
            const interaction = makeInteraction({
                options: {
                    getString: jest.fn().mockReturnValue('pop'),
                },
            })
            mockGetGuildSettings.mockResolvedValueOnce({
                autoplayGenres: ['rock', 'jazz'],
            })
            mockCreateErrorEmbed.mockReturnValueOnce({ type: 'error' })

            await handleAutoplayGenre(interaction, 'remove')

            expect(mockCreateErrorEmbed).toHaveBeenCalledWith(
                'Not Found',
                'Genre **pop** is not in your list.',
            )
        })

        it('removes genre successfully', async () => {
            const interaction = makeInteraction({
                options: {
                    getString: jest.fn().mockReturnValue('rock'),
                },
            })
            mockGetGuildSettings.mockResolvedValueOnce({
                autoplayGenres: ['rock', 'jazz', 'pop'],
            })
            mockUpdateGuildSettings.mockResolvedValueOnce(true)
            mockCreateEmbed.mockReturnValueOnce({ type: 'embed' })

            await handleAutoplayGenre(interaction, 'remove')

            expect(mockUpdateGuildSettings).toHaveBeenCalledWith('guild-123', {
                autoplayGenres: ['jazz', 'pop'],
            })
            expect(mockCreateEmbed).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: '✅ Genre removed',
                }),
            )
        })

        it('shows error when update fails', async () => {
            const interaction = makeInteraction({
                options: {
                    getString: jest.fn().mockReturnValue('rock'),
                },
            })
            mockGetGuildSettings.mockResolvedValueOnce({
                autoplayGenres: ['rock'],
            })
            mockUpdateGuildSettings.mockResolvedValueOnce(false)
            mockCreateErrorEmbed.mockReturnValueOnce({ type: 'error' })

            await handleAutoplayGenre(interaction, 'remove')

            expect(mockCreateErrorEmbed).toHaveBeenCalledWith(
                'Error',
                'Failed to remove genre.',
            )
        })
    })

    describe('list subcommand', () => {
        it('shows error when guildId is missing', async () => {
            const interaction = makeInteraction({ guildId: null })

            await handleAutoplayGenre(interaction, 'list')

            expect(mockCreateErrorEmbed).toHaveBeenCalledWith('Guild Not Found', 'Unable to retrieve guild information.')
            expect(mockInteractionReply).toHaveBeenCalledTimes(1)
        })

        it('shows empty genres message when no genres configured', async () => {
            mockGetGuildSettings.mockResolvedValueOnce({
                autoplayGenres: [],
            })
            mockCreateEmbed.mockReturnValueOnce({ type: 'embed' })

            await handleAutoplayGenre(baseInteraction, 'list')

            expect(mockCreateEmbed).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: '🎵 Autoplay Genres',
                    description: 'No genres configured yet.',
                }),
            )
        })

        it('shows all genres with numbered list', async () => {
            mockGetGuildSettings.mockResolvedValueOnce({
                autoplayGenres: ['rock', 'jazz', 'pop'],
            })
            mockCreateEmbed.mockReturnValueOnce({ type: 'embed' })

            await handleAutoplayGenre(baseInteraction, 'list')

            expect(mockCreateEmbed).toHaveBeenCalledWith(
                expect.objectContaining({
                    description: expect.stringContaining('1. rock'),
                }),
            )
        })
    })

    describe('clear subcommand', () => {
        it('shows error when guildId is missing', async () => {
            const interaction = makeInteraction({ guildId: null })

            await handleAutoplayGenre(interaction, 'clear')

            expect(mockCreateErrorEmbed).toHaveBeenCalledWith('Guild Not Found', 'Unable to retrieve guild information.')
            expect(mockInteractionReply).toHaveBeenCalledTimes(1)
        })

        it('shows error when no genres to clear', async () => {
            mockGetGuildSettings.mockResolvedValueOnce({
                autoplayGenres: [],
            })
            mockCreateErrorEmbed.mockReturnValueOnce({ type: 'error' })

            await handleAutoplayGenre(baseInteraction, 'clear')

            expect(mockCreateErrorEmbed).toHaveBeenCalledWith(
                'No Genres',
                'No genres to clear.',
            )
        })

        it('clears all genres successfully', async () => {
            mockGetGuildSettings.mockResolvedValueOnce({
                autoplayGenres: ['rock', 'jazz'],
            })
            mockUpdateGuildSettings.mockResolvedValueOnce(true)
            mockCreateEmbed.mockReturnValueOnce({ type: 'embed' })

            await handleAutoplayGenre(baseInteraction, 'clear')

            expect(mockUpdateGuildSettings).toHaveBeenCalledWith('guild-123', {
                autoplayGenres: [],
            })
            expect(mockCreateEmbed).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: '✅ Genres cleared',
                }),
            )
        })

        it('shows error when clear fails', async () => {
            mockGetGuildSettings.mockResolvedValueOnce({
                autoplayGenres: ['rock'],
            })
            mockUpdateGuildSettings.mockResolvedValueOnce(false)
            mockCreateErrorEmbed.mockReturnValueOnce({ type: 'error' })

            await handleAutoplayGenre(baseInteraction, 'clear')

            expect(mockCreateErrorEmbed).toHaveBeenCalledWith(
                'Error',
                'Failed to clear genres.',
            )
        })
    })

    it('shows error for unknown subcommand', async () => {
        mockCreateErrorEmbed.mockReturnValueOnce({ type: 'error' })

        await handleAutoplayGenre(baseInteraction, 'unknown')

        expect(mockCreateErrorEmbed).toHaveBeenCalledWith(
            'Unknown Subcommand',
            'That genre subcommand is not recognized.',
        )
    })
})

describe('handleAutoplayAnalytics', () => {
    const baseInteraction = makeInteraction()

    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('returns error when guildId is missing', async () => {
        const interaction = makeInteraction({ guildId: null })
        mockCreateErrorEmbed.mockReturnValueOnce({ type: 'error' })

        await handleAutoplayAnalytics(interaction)

        expect(mockCreateErrorEmbed).toHaveBeenCalledWith(
            'Guild Not Found',
            'Unable to retrieve guild information.',
        )
    })

    it('shows no play history message when stats total is zero', async () => {
        mockGetAutoplayStats.mockResolvedValueOnce({ total: 0 })
        mockCreateEmbed.mockReturnValueOnce({ type: 'embed' })

        await handleAutoplayAnalytics(baseInteraction)

        expect(mockCreateEmbed).toHaveBeenCalledWith(
            expect.objectContaining({
                title: '📈 Autoplay Analytics',
                description: 'No play history yet.',
            }),
        )
    })

    it('shows analytics with top artists when stats exist', async () => {
        mockGetAutoplayStats.mockResolvedValueOnce({
            total: 100,
            autoplayCount: 75,
            autoplayPercent: 75,
            topAutoplayArtists: [
                { artist: 'The Beatles', count: 15 },
                { artist: 'Pink Floyd', count: 10 },
            ],
        })
        mockCreateEmbed.mockReturnValueOnce({ type: 'embed' })

        await handleAutoplayAnalytics(baseInteraction)

        expect(mockCreateEmbed).toHaveBeenCalledWith(
            expect.objectContaining({
                title: '📈 Autoplay Analytics',
                description: expect.stringContaining('100'),
            }),
        )
    })

    it('shows correct plural form for single play', async () => {
        mockGetAutoplayStats.mockResolvedValueOnce({
            total: 10,
            autoplayCount: 1,
            autoplayPercent: 10,
            topAutoplayArtists: [{ artist: 'Artist', count: 1 }],
        })
        mockCreateEmbed.mockReturnValueOnce({ type: 'embed' })

        await handleAutoplayAnalytics(baseInteraction)

        expect(mockCreateEmbed).toHaveBeenCalledWith(
            expect.objectContaining({
                description: expect.stringContaining('1 play'),
            }),
        )
    })

    it('shows correct plural form for multiple plays', async () => {
        mockGetAutoplayStats.mockResolvedValueOnce({
            total: 10,
            autoplayCount: 5,
            autoplayPercent: 50,
            topAutoplayArtists: [{ artist: 'Artist', count: 5 }],
        })
        mockCreateEmbed.mockReturnValueOnce({ type: 'embed' })

        await handleAutoplayAnalytics(baseInteraction)

        expect(mockCreateEmbed).toHaveBeenCalledWith(
            expect.objectContaining({
                description: expect.stringContaining('5 plays'),
            }),
        )
    })

    it('shows no autoplay data message when topAutoplayArtists is empty', async () => {
        mockGetAutoplayStats.mockResolvedValueOnce({
            total: 50,
            autoplayCount: 0,
            autoplayPercent: 0,
            topAutoplayArtists: [],
        })
        mockCreateEmbed.mockReturnValueOnce({ type: 'embed' })

        await handleAutoplayAnalytics(baseInteraction)

        expect(mockCreateEmbed).toHaveBeenCalledWith(
            expect.objectContaining({
                description: expect.stringContaining('No autoplay data yet.'),
            }),
        )
    })

    it('handles service error gracefully', async () => {
        mockGetAutoplayStats.mockRejectedValueOnce(new Error('Service error'))
        mockCreateErrorEmbed.mockReturnValueOnce({ type: 'error' })

        await handleAutoplayAnalytics(baseInteraction)

        expect(mockCreateErrorEmbed).toHaveBeenCalledWith(
            'Error',
            'Failed to retrieve autoplay analytics.',
        )
    })
})
