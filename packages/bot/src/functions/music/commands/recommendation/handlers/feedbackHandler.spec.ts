import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { handleFeedback } from './feedbackHandler'

const interactionReplyMock = jest.fn()
const createErrorEmbedMock = jest.fn((title: string, message: string) => ({
    type: 'error',
    title,
    message,
}))
const createWarningEmbedMock = jest.fn((title: string, message: string) => ({
    type: 'warning',
    title,
    message,
}))
const createSuccessEmbedMock = jest.fn((title: string, message: string) => ({
    type: 'success',
    title,
    message,
}))
const buildTrackKeyMock = jest.fn()
const setFeedbackMock = jest.fn()
const resolveGuildQueueMock = jest.fn()
type FeedbackInteraction = Parameters<typeof handleFeedback>[0]
type FeedbackClient = Parameters<typeof handleFeedback>[1]

jest.mock('../../../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../../../utils/general/embeds', () => ({
    createErrorEmbed: (...args: unknown[]) => createErrorEmbedMock(...args),
    createWarningEmbed: (...args: unknown[]) => createWarningEmbedMock(...args),
    createSuccessEmbed: (...args: unknown[]) => createSuccessEmbedMock(...args),
}))

jest.mock('../../../../../services/musicRecommendation/feedbackService', () => ({
    recommendationFeedbackService: {
        buildTrackKey: (...args: unknown[]) => buildTrackKeyMock(...args),
        setFeedback: (...args: unknown[]) => setFeedbackMock(...args),
    },
}))

jest.mock('../../../../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

function createInteraction(guildId: string | null, trackUrl?: string | null) {
    return {
        guildId,
        user: { id: 'user-1' },
        options: {
            getString: jest.fn((name: string, required?: boolean) => {
                if (name === 'feedback' && required) return 'like'
                if (name === 'track_url') return trackUrl ?? null
                return null
            }),
        },
    } as unknown as FeedbackInteraction
}

function createClient() {
    return {
        player: {},
    } as unknown as FeedbackClient
}

describe('handleFeedback', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        buildTrackKeyMock.mockImplementation(
            (a: string, b: string) => `${a}::${b}`,
        )
        setFeedbackMock.mockResolvedValue(undefined)
        resolveGuildQueueMock.mockReturnValue({
            queue: null,
        })
    })

    it('rejects execution outside guilds', async () => {
        await handleFeedback(createInteraction(null), createClient())

        expect(createErrorEmbedMock).toHaveBeenCalledWith(
            'Error',
            'This command can only be used in a server!',
        )
        expect(setFeedbackMock).not.toHaveBeenCalled()
    })

    it('warns when there is no current track and no track url', async () => {
        await handleFeedback(createInteraction('guild-1'), createClient())

        expect(createWarningEmbedMock).toHaveBeenCalledWith(
            'No Track',
            'No current track found. Provide `track_url` to leave feedback.',
        )
        expect(setFeedbackMock).not.toHaveBeenCalled()
    })

    it('stores feedback using current track identity', async () => {
        const currentTrack = {
            title: 'Song A',
            author: 'Artist A',
            url: 'https://example.com/a',
        }
        resolveGuildQueueMock.mockReturnValue({
            queue: { currentTrack },
        })

        await handleFeedback(
            createInteraction('guild-1', 'https://example.com/a'),
            createClient(),
        )

        expect(buildTrackKeyMock).toHaveBeenCalledWith('Song A', 'Artist A')
        expect(setFeedbackMock).toHaveBeenCalledWith(
            'guild-1',
            'user-1',
            'Song A::Artist A',
            'like',
        )
        expect(createSuccessEmbedMock).toHaveBeenCalledWith(
            'Feedback saved',
            'Stored **like** feedback for this recommendation profile.',
        )
    })

    it('stores feedback using explicit track url fallback', async () => {
        const currentTrack = {
            title: 'Song A',
            author: 'Artist A',
            url: 'https://example.com/a',
        }
        resolveGuildQueueMock.mockReturnValue({
            queue: { currentTrack },
        })

        await handleFeedback(
            createInteraction('guild-1', 'https://example.com/other'),
            createClient(),
        )

        expect(buildTrackKeyMock).toHaveBeenCalledWith(
            'https://example.com/other',
            'url',
        )
        expect(setFeedbackMock).toHaveBeenCalled()
    })

    it('passes resolver miss queue to warning branch', async () => {
        await handleFeedback(createInteraction('guild-1'), createClient())

        expect(resolveGuildQueueMock).toHaveBeenCalledWith(
            expect.anything(),
            'guild-1',
        )
        expect(createWarningEmbedMock).toHaveBeenCalledWith(
            'No Track',
            'No current track found. Provide `track_url` to leave feedback.',
        )
    })
})
