import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { handleFeedback } from './feedbackHandler'

const interactionReplyMock = jest.fn()
const errorEmbedMock = jest.fn((title: string, message: string) => ({
    type: 'error',
    title,
    message,
}))
const warningEmbedMock = jest.fn((title: string, message: string) => ({
    type: 'warning',
    title,
    message,
}))
const successEmbedMock = jest.fn((title: string, message: string) => ({
    type: 'success',
    title,
    message,
}))
const buildTrackKeyMock = jest.fn()
const setFeedbackMock = jest.fn()

jest.mock('../../../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../../../utils/general/embeds', () => ({
    errorEmbed: (...args: unknown[]) => errorEmbedMock(...args),
    warningEmbed: (...args: unknown[]) => warningEmbedMock(...args),
    successEmbed: (...args: unknown[]) => successEmbedMock(...args),
}))

jest.mock('../../../../../services/musicRecommendation/feedbackService', () => ({
    recommendationFeedbackService: {
        buildTrackKey: (...args: unknown[]) => buildTrackKeyMock(...args),
        setFeedback: (...args: unknown[]) => setFeedbackMock(...args),
    },
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
    } as any
}

function createClient(currentTrack?: unknown) {
    return {
        player: {
            nodes: {
                get: jest.fn(() =>
                    currentTrack ? { currentTrack } : { currentTrack: null },
                ),
            },
        },
    } as any
}

describe('handleFeedback', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        buildTrackKeyMock.mockImplementation(
            (a: string, b: string) => `${a}::${b}`,
        )
        setFeedbackMock.mockResolvedValue(undefined)
    })

    it('rejects execution outside guilds', async () => {
        await handleFeedback(createInteraction(null), createClient())

        expect(errorEmbedMock).toHaveBeenCalledWith(
            'Error',
            'This command can only be used in a server!',
        )
        expect(setFeedbackMock).not.toHaveBeenCalled()
    })

    it('warns when there is no current track and no track url', async () => {
        await handleFeedback(createInteraction('guild-1'), createClient())

        expect(warningEmbedMock).toHaveBeenCalledWith(
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

        await handleFeedback(
            createInteraction('guild-1', 'https://example.com/a'),
            createClient(currentTrack),
        )

        expect(buildTrackKeyMock).toHaveBeenCalledWith('Song A', 'Artist A')
        expect(setFeedbackMock).toHaveBeenCalledWith(
            'guild-1',
            'user-1',
            'Song A::Artist A',
            'like',
        )
        expect(successEmbedMock).toHaveBeenCalledWith(
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

        await handleFeedback(
            createInteraction('guild-1', 'https://example.com/other'),
            createClient(currentTrack),
        )

        expect(buildTrackKeyMock).toHaveBeenCalledWith(
            'https://example.com/other',
            'url',
        )
        expect(setFeedbackMock).toHaveBeenCalled()
    })
})
