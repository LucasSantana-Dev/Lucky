import { jest } from '@jest/globals'
import type { ChatInputCommandInteraction } from 'discord.js'

const mockInteractionReply = jest.fn().mockResolvedValue(undefined)
const mockSetArtistFeedback = jest.fn().mockResolvedValue(undefined)
const mockRemoveArtistFeedback = jest.fn().mockResolvedValue(undefined)
const mockGetArtistFeedbackSummary = jest.fn()
const mockCreateEmbed = jest.fn().mockReturnValue({ type: 'embed' })
const mockCreateErrorEmbed = jest.fn().mockReturnValue({ type: 'error-embed' })
const mockErrorLog = jest.fn()

jest.mock('../../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => mockInteractionReply(...args),
}))

jest.mock('../../../../services/musicRecommendation/feedbackService', () => ({
    recommendationFeedbackService: {
        setArtistFeedback: (...args: unknown[]) => mockSetArtistFeedback(...args),
        removeArtistFeedback: (...args: unknown[]) => mockRemoveArtistFeedback(...args),
        getArtistFeedbackSummary: (...args: unknown[]) => mockGetArtistFeedbackSummary(...args),
    },
}))

jest.mock('../../../../utils/general/embeds', () => ({
    createEmbed: (...args: unknown[]) => mockCreateEmbed(...args),
    createErrorEmbed: (...args: unknown[]) => mockCreateErrorEmbed(...args),
    EMBED_COLORS: { AUTOPLAY: '#7289DA', ERROR: '#FF0000' },
    EMOJIS: { AUTOPLAY: '📻' },
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: unknown[]) => mockErrorLog(...args),
}))

import { handleAutoplayArtist } from './artistHandlers'

function makeInteraction(
    subcommand: string,
    artistName: string | null = null,
    guildId: string | null = 'guild-123',
): ChatInputCommandInteraction {
    return {
        guildId,
        user: { id: 'user-1' },
        options: {
            getSubcommand: () => subcommand,
            getString: (_key: string) => artistName,
        },
    } as unknown as ChatInputCommandInteraction
}

describe('handleAutoplayArtist', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('missing guildId', () => {
        it('shows error embed and does not call service', async () => {
            const interaction = makeInteraction('prefer', 'artist', null)
            mockCreateErrorEmbed.mockReturnValueOnce({ type: 'error' })

            await handleAutoplayArtist(interaction)

            expect(mockCreateErrorEmbed).toHaveBeenCalledWith(
                'Guild Not Found',
                'Unable to retrieve guild information.',
            )
            expect(mockInteractionReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.objectContaining({
                        ephemeral: true,
                    }),
                }),
            )
            expect(mockSetArtistFeedback).not.toHaveBeenCalled()
            expect(mockRemoveArtistFeedback).not.toHaveBeenCalled()
        })
    })

    describe('subcommand: prefer', () => {
        it('shows missing input error when artist name is null', async () => {
            const interaction = makeInteraction('prefer', null)
            mockCreateErrorEmbed.mockReturnValueOnce({ type: 'error' })

            await handleAutoplayArtist(interaction)

            expect(mockCreateErrorEmbed).toHaveBeenCalledWith(
                'Missing Input',
                'Please provide an artist name.',
            )
            expect(mockSetArtistFeedback).not.toHaveBeenCalled()
        })

        it('calls setArtistFeedback with prefer and shows success embed', async () => {
            const interaction = makeInteraction('prefer', 'The Beatles')
            mockCreateEmbed.mockReturnValueOnce({ type: 'success' })

            await handleAutoplayArtist(interaction)

            expect(mockSetArtistFeedback).toHaveBeenCalledWith(
                'guild-123',
                'user-1',
                'The Beatles',
                'prefer',
            )
            expect(mockCreateEmbed).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: '⭐ Artist Preferred',
                    color: '#7289DA',
                }),
            )
            expect(mockInteractionReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.objectContaining({
                        ephemeral: true,
                    }),
                }),
            )
        })
    })

    describe('subcommand: block', () => {
        it('shows missing input error when artist name is null', async () => {
            const interaction = makeInteraction('block', null)
            mockCreateErrorEmbed.mockReturnValueOnce({ type: 'error' })

            await handleAutoplayArtist(interaction)

            expect(mockCreateErrorEmbed).toHaveBeenCalledWith(
                'Missing Input',
                'Please provide an artist name.',
            )
            expect(mockSetArtistFeedback).not.toHaveBeenCalled()
        })

        it('calls setArtistFeedback with block and shows success embed with error color', async () => {
            const interaction = makeInteraction('block', 'Nickelback')
            mockCreateEmbed.mockReturnValueOnce({ type: 'success' })

            await handleAutoplayArtist(interaction)

            expect(mockSetArtistFeedback).toHaveBeenCalledWith(
                'guild-123',
                'user-1',
                'Nickelback',
                'block',
            )
            expect(mockCreateEmbed).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: '🚫 Artist Blocked',
                    color: '#FF0000',
                }),
            )
            expect(mockInteractionReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.objectContaining({
                        ephemeral: true,
                    }),
                }),
            )
        })
    })

    describe('subcommand: remove', () => {
        it('shows missing input error when artist name is null', async () => {
            const interaction = makeInteraction('remove', null)
            mockCreateErrorEmbed.mockReturnValueOnce({ type: 'error' })

            await handleAutoplayArtist(interaction)

            expect(mockCreateErrorEmbed).toHaveBeenCalledWith(
                'Missing Input',
                'Please provide an artist name.',
            )
            expect(mockRemoveArtistFeedback).not.toHaveBeenCalled()
        })

        it('calls removeArtistFeedback and shows success embed', async () => {
            const interaction = makeInteraction('remove', 'Drake')
            mockCreateEmbed.mockReturnValueOnce({ type: 'success' })

            await handleAutoplayArtist(interaction)

            expect(mockRemoveArtistFeedback).toHaveBeenCalledWith(
                'guild-123',
                'user-1',
                'Drake',
            )
            expect(mockSetArtistFeedback).not.toHaveBeenCalled()
            expect(mockCreateEmbed).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: '✓ Preference Removed',
                    color: '#7289DA',
                }),
            )
        })
    })

    describe('subcommand: list', () => {
        it('shows no preferred and no blocked artists when both are empty', async () => {
            const interaction = makeInteraction('list')
            mockGetArtistFeedbackSummary.mockResolvedValueOnce({
                preferred: [],
                blocked: [],
            })
            mockCreateEmbed.mockReturnValueOnce({ type: 'list' })

            await handleAutoplayArtist(interaction)

            expect(mockGetArtistFeedbackSummary).toHaveBeenCalledWith('user-1')
            expect(mockCreateEmbed).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: '🎯 Your Artist Preferences',
                    description: expect.stringContaining('No preferred artists.'),
                }),
            )
            expect(mockCreateEmbed).toHaveBeenCalledWith(
                expect.objectContaining({
                    description: expect.stringContaining('No blocked artists.'),
                }),
            )
        })

        it('maps preferred artists with star emoji', async () => {
            const interaction = makeInteraction('list')
            mockGetArtistFeedbackSummary.mockResolvedValueOnce({
                preferred: ['Beatles', 'Pink Floyd'],
                blocked: [],
            })
            mockCreateEmbed.mockReturnValueOnce({ type: 'list' })

            await handleAutoplayArtist(interaction)

            expect(mockCreateEmbed).toHaveBeenCalledWith(
                expect.objectContaining({
                    description: expect.stringContaining('⭐ Beatles'),
                }),
            )
            expect(mockCreateEmbed).toHaveBeenCalledWith(
                expect.objectContaining({
                    description: expect.stringContaining('⭐ Pink Floyd'),
                }),
            )
        })

        it('maps blocked artists with blocked emoji', async () => {
            const interaction = makeInteraction('list')
            mockGetArtistFeedbackSummary.mockResolvedValueOnce({
                preferred: [],
                blocked: ['Cardi B', 'Lil Pump'],
            })
            mockCreateEmbed.mockReturnValueOnce({ type: 'list' })

            await handleAutoplayArtist(interaction)

            expect(mockCreateEmbed).toHaveBeenCalledWith(
                expect.objectContaining({
                    description: expect.stringContaining('🚫 Cardi B'),
                }),
            )
            expect(mockCreateEmbed).toHaveBeenCalledWith(
                expect.objectContaining({
                    description: expect.stringContaining('🚫 Lil Pump'),
                }),
            )
        })

        it('shows both preferred and blocked artists with correct format', async () => {
            const interaction = makeInteraction('list')
            mockGetArtistFeedbackSummary.mockResolvedValueOnce({
                preferred: ['Adele'],
                blocked: ['Imagine Dragons'],
            })
            mockCreateEmbed.mockReturnValueOnce({ type: 'list' })

            await handleAutoplayArtist(interaction)

            expect(mockCreateEmbed).toHaveBeenCalledWith(
                expect.objectContaining({
                    description: expect.stringContaining('⭐ Adele'),
                }),
            )
            expect(mockCreateEmbed).toHaveBeenCalledWith(
                expect.objectContaining({
                    description: expect.stringContaining('🚫 Imagine Dragons'),
                }),
            )
        })
    })

    describe('unknown subcommand', () => {
        it('shows unknown subcommand error embed', async () => {
            const interaction = makeInteraction('invalid')
            mockCreateErrorEmbed.mockReturnValueOnce({ type: 'error' })

            await handleAutoplayArtist(interaction)

            expect(mockCreateErrorEmbed).toHaveBeenCalledWith(
                'Unknown Subcommand',
                'This subcommand is not recognized.',
            )
            expect(mockInteractionReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.objectContaining({
                        ephemeral: true,
                    }),
                }),
            )
        })
    })

    describe('error handling', () => {
        it('logs error and shows error embed when setArtistFeedback throws', async () => {
            const interaction = makeInteraction('prefer', 'Radiohead')
            const error = new Error('Service unavailable')
            mockSetArtistFeedback.mockRejectedValueOnce(error)
            mockCreateErrorEmbed.mockReturnValueOnce({ type: 'error' })

            await handleAutoplayArtist(interaction)

            expect(mockErrorLog).toHaveBeenCalledWith({
                message: 'Failed to handle artist preference',
                error,
                data: { guildId: 'guild-123', userId: 'user-1', subcommandName: 'prefer' },
            })
            expect(mockCreateErrorEmbed).toHaveBeenCalledWith(
                'Error',
                'Failed to update artist preferences.',
            )
        })

        it('logs error and shows error embed when removeArtistFeedback throws', async () => {
            const interaction = makeInteraction('remove', 'Taylor Swift')
            const error = new Error('Database error')
            mockRemoveArtistFeedback.mockRejectedValueOnce(error)
            mockCreateErrorEmbed.mockReturnValueOnce({ type: 'error' })

            await handleAutoplayArtist(interaction)

            expect(mockErrorLog).toHaveBeenCalledWith({
                message: 'Failed to handle artist preference',
                error,
                data: { guildId: 'guild-123', userId: 'user-1', subcommandName: 'remove' },
            })
        })

        it('logs error and shows error embed when getArtistFeedbackSummary throws', async () => {
            const interaction = makeInteraction('list')
            const error = new Error('Fetch failed')
            mockGetArtistFeedbackSummary.mockRejectedValueOnce(error)
            mockCreateErrorEmbed.mockReturnValueOnce({ type: 'error' })

            await handleAutoplayArtist(interaction)

            expect(mockErrorLog).toHaveBeenCalledWith({
                message: 'Failed to handle artist preference',
                error,
                data: { guildId: 'guild-123', userId: 'user-1', subcommandName: 'list' },
            })
            expect(mockCreateErrorEmbed).toHaveBeenCalledWith(
                'Error',
                'Failed to update artist preferences.',
            )
        })

        it('includes correct subcommand name in error log for block', async () => {
            const interaction = makeInteraction('block', 'TestArtist')
            mockSetArtistFeedback.mockRejectedValueOnce(new Error('API error'))
            mockCreateErrorEmbed.mockReturnValueOnce({ type: 'error' })

            await handleAutoplayArtist(interaction)

            expect(mockErrorLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        subcommandName: 'block',
                    }),
                }),
            )
        })
    })
})
