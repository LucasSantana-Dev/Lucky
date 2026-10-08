import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { MUSIC_BUTTON_IDS } from '../types/musicButtons'

const resolveGuildQueueMock = jest.fn()
const setFeedbackMock = jest.fn<(...args: unknown[]) => Promise<boolean>>()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
}))

jest.mock('../utils/general/embeds', () => ({
    createErrorEmbed: (title: string, description: string) => ({
        title,
        description,
    }),
}))

jest.mock('../utils/music/buttonComponents', () => ({
    createMusicControlButtons: jest.fn(() => ({})),
    createMusicActionButtons: jest.fn(() => ({})),
    createLeaderboardPaginationButtons: jest.fn(() => null),
}))

jest.mock('../functions/music/commands/queue/queueEmbed', () => ({
    createQueueEmbed: jest.fn(),
}))

jest.mock('../services/musicManagement/queueManipulation', () => ({
    shuffleQueue: jest.fn(),
}))

jest.mock('../services/musicManagement/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

jest.mock('@lucky/shared/services', () => ({
    levelService: { getLeaderboard: jest.fn() },
}))

jest.mock('../services/musicManagement/replenishSuppressionStore', () => ({
    setReplenishSuppressed: jest.fn(),
}))

jest.mock('../services/musicRecommendation/feedbackService', () => ({
    recommendationFeedbackService: {
        setFeedback: (...args: unknown[]) => setFeedbackMock(...args),
        // Mirrors normalizeTrackKey's letter/number filter.
        buildTrackKey: (title: string, author: string) =>
            `${title.replace(/[^\p{L}\p{N}]/gu, '')}::${author.replace(/[^\p{L}\p{N}]/gu, '')}`,
    },
}))

jest.mock('../i18n/translatorForInteraction', () => ({
    translatorForInteraction:
        async () => (key: string, options?: { title?: string }) =>
            options?.title === undefined ? key : `${key}|${options.title}`,
}))

import { handleMusicButtonInteraction } from './musicButtonHandler'

function createInteraction(customId: string) {
    return {
        customId,
        guildId: '111111111111111111',
        client: {},
        member: { voice: { channel: {} } },
        deferred: true,
        replied: false,
        deferUpdate: jest.fn<() => Promise<void>>().mockResolvedValue(),
        followUp: jest.fn<() => Promise<void>>().mockResolvedValue(),
        editReply: jest.fn<() => Promise<void>>().mockResolvedValue(),
    }
}

function createQueue(overrides: Record<string, unknown> = {}) {
    return {
        history: {
            previousTrack: null,
            back: jest.fn<() => Promise<void>>().mockResolvedValue(),
        },
        ...overrides,
    }
}

describe('handleMusicButtonInteraction — previous button (#1191)', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('tells the user when there is no previous track instead of erroring', async () => {
        const queue = createQueue()
        resolveGuildQueueMock.mockReturnValue({ queue, source: 'player' })
        const interaction = createInteraction(MUSIC_BUTTON_IDS.PREVIOUS)

        await handleMusicButtonInteraction(interaction as never)

        expect(interaction.followUp).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.stringContaining('No previous track'),
                ephemeral: true,
            }),
        )
        expect(queue.history.back).not.toHaveBeenCalled()
        expect(interaction.editReply).not.toHaveBeenCalled()
    })

    it('goes back when a previous track exists', async () => {
        const queue = createQueue()
        queue.history.previousTrack = { id: 't1' } as never
        resolveGuildQueueMock.mockReturnValue({ queue, source: 'player' })
        const interaction = createInteraction(MUSIC_BUTTON_IDS.PREVIOUS)

        await handleMusicButtonInteraction(interaction as never)

        expect(queue.history.back).toHaveBeenCalledTimes(1)
        expect(interaction.followUp).not.toHaveBeenCalled()
    })

    it('surfaces an error embed when the queue op throws (no silent desync)', async () => {
        const queue = createQueue()
        queue.history.previousTrack = { id: 't1' } as never
        queue.history.back.mockRejectedValue(new Error('voice connection lost'))
        resolveGuildQueueMock.mockReturnValue({ queue, source: 'player' })
        const interaction = createInteraction(MUSIC_BUTTON_IDS.PREVIOUS)

        await handleMusicButtonInteraction(interaction as never)

        expect(interaction.editReply).toHaveBeenCalledWith(
            expect.objectContaining({
                embeds: [expect.objectContaining({ title: 'Error' })],
            }),
        )
    })
})

describe('handleMusicButtonInteraction - thumbs buttons (#2658)', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        setFeedbackMock.mockResolvedValue(true)
    })

    function thumbsInteraction(customId: string) {
        return {
            ...createInteraction(customId),
            user: { id: 'user-1', username: 'listener' },
        }
    }

    it.each([
        [MUSIC_BUTTON_IDS.LIKE, 'like', 'music.thumbs.liked'],
        [MUSIC_BUTTON_IDS.DISLIKE, 'dislike', 'music.thumbs.disliked'],
    ])(
        '%s stores the clicker feedback for the track playing now',
        async (customId, feedback, replyKey) => {
            const queue = createQueue({
                guild: { id: 'guild-1' },
                currentTrack: { title: 'Song', author: 'Artist' },
            })
            resolveGuildQueueMock.mockReturnValue({ queue })
            const interaction = thumbsInteraction(customId)

            await handleMusicButtonInteraction(interaction as never)

            expect(setFeedbackMock).toHaveBeenCalledWith(
                'guild-1',
                'user-1',
                'listener',
                'Song::Artist',
                feedback,
            )
            expect(interaction.followUp).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: `${replyKey}|Song`,
                    ephemeral: true,
                    allowedMentions: { parse: [] },
                }),
            )
        },
    )

    it('reports a failed save instead of claiming success', async () => {
        setFeedbackMock.mockResolvedValue(false)
        const queue = createQueue({
            guild: { id: 'guild-1' },
            currentTrack: { title: 'Song', author: 'Artist' },
        })
        resolveGuildQueueMock.mockReturnValue({ queue })
        const interaction = thumbsInteraction(MUSIC_BUTTON_IDS.LIKE)

        await handleMusicButtonInteraction(interaction as never)

        expect(interaction.followUp).toHaveBeenCalledWith(
            expect.objectContaining({ content: 'music.thumbs.failed' }),
        )
    })

    it('escapes markdown and clips long titles in the reply', async () => {
        const queue = createQueue({
            guild: { id: 'guild-1' },
            currentTrack: { title: `**bold** ${'x'.repeat(300)}`, author: 'A' },
        })
        resolveGuildQueueMock.mockReturnValue({ queue })
        const interaction = thumbsInteraction(MUSIC_BUTTON_IDS.LIKE)

        await handleMusicButtonInteraction(interaction as never)

        const content = (
            interaction.followUp.mock.calls[0] as unknown as [
                { content: string },
            ]
        )[0].content
        expect(content).toContain('\\*\\*bold\\*\\*')
        expect(content).toContain('…')
        expect(content.length).toBeLessThan(260)
    })

    it('stores nothing for a track whose metadata normalizes to nothing', async () => {
        const queue = createQueue({
            guild: { id: 'guild-1' },
            currentTrack: { title: '★ ★', author: '—' },
        })
        resolveGuildQueueMock.mockReturnValue({ queue })
        const interaction = thumbsInteraction(MUSIC_BUTTON_IDS.LIKE)

        await handleMusicButtonInteraction(interaction as never)

        expect(setFeedbackMock).not.toHaveBeenCalled()
    })

    it('stores nothing for a track with neither title nor author', async () => {
        const queue = createQueue({
            guild: { id: 'guild-1' },
            currentTrack: { title: '', author: '' },
        })
        resolveGuildQueueMock.mockReturnValue({ queue })
        const interaction = thumbsInteraction(MUSIC_BUTTON_IDS.DISLIKE)

        await handleMusicButtonInteraction(interaction as never)

        expect(setFeedbackMock).not.toHaveBeenCalled()
        expect(interaction.followUp).toHaveBeenCalledWith(
            expect.objectContaining({ content: 'music.thumbs.noTrack' }),
        )
    })

    it('says nothing is playing and stores nothing without a current track', async () => {
        const queue = createQueue({
            guild: { id: 'guild-1' },
            currentTrack: null,
        })
        resolveGuildQueueMock.mockReturnValue({ queue })
        const interaction = thumbsInteraction(MUSIC_BUTTON_IDS.LIKE)

        await handleMusicButtonInteraction(interaction as never)

        expect(setFeedbackMock).not.toHaveBeenCalled()
        expect(interaction.followUp).toHaveBeenCalledWith(
            expect.objectContaining({
                content: 'music.thumbs.noTrack',
                ephemeral: true,
            }),
        )
    })
})
