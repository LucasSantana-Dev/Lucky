import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { ChatInputCommandInteraction } from 'discord.js'

const mockInteractionReply = jest.fn()
const mockSetFeedback = jest.fn()
const mockBuildTrackKey = jest.fn(
    (title: string, author: string) => `${title}::${author}`,
)
const mockResolveGuildQueue = jest.fn()

jest.mock('../../../../../utils/general/interactionReply', () => ({
    interactionReply: mockInteractionReply,
}))

jest.mock('../../../../../utils/general/embeds', () => ({
    createErrorEmbed: (title: string) => ({ kind: 'error', title }),
    createSuccessEmbed: (title: string) => ({ kind: 'success', title }),
    createWarningEmbed: (title: string) => ({ kind: 'warning', title }),
}))

jest.mock(
    '../../../../../services/musicRecommendation/feedbackService',
    () => ({
        recommendationFeedbackService: {
            setFeedback: mockSetFeedback,
            buildTrackKey: mockBuildTrackKey,
        },
    }),
)

jest.mock('../../../../../services/musicManagement/queueResolver', () => ({
    resolveGuildQueue: mockResolveGuildQueue,
}))

import { handleFeedback } from './feedbackHandler'

function interactionWith(trackUrl: string | null): ChatInputCommandInteraction {
    return {
        guildId: 'guild-1',
        user: { id: 'user-1', username: 'user' },
        options: {
            getString: jest.fn((key: string) =>
                key === 'feedback' ? 'like' : trackUrl,
            ),
        },
    } as unknown as ChatInputCommandInteraction
}

function embedKind(): string {
    const call = mockInteractionReply.mock.calls[0][0] as {
        content: { embeds: Array<{ kind: string }> }
    }
    return call.content.embeds[0].kind
}

describe('handleFeedback', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockResolveGuildQueue.mockReturnValue({
            queue: {
                currentTrack: {
                    title: 'Song',
                    author: 'Artist',
                    url: 'https://x/song',
                },
            },
        })
    })

    it('saves feedback for the playing track', async () => {
        mockSetFeedback.mockResolvedValue(true)
        await handleFeedback(interactionWith(null), {} as never)
        expect(mockSetFeedback).toHaveBeenCalledWith(
            'guild-1',
            'user-1',
            'user',
            'Song::Artist',
            'like',
        )
        expect(embedKind()).toBe('success')
    })

    it('replies with an error when the write fails (#2686)', async () => {
        mockSetFeedback.mockResolvedValue(false)
        await handleFeedback(interactionWith(null), {} as never)
        expect(mockInteractionReply).toHaveBeenCalledTimes(1)
        expect(embedKind()).toBe('error')
    })

    it('does not store a vote under a key autoplay never reads (#2686)', async () => {
        await handleFeedback(
            interactionWith('https://x/other-track'),
            {} as never,
        )
        expect(mockSetFeedback).not.toHaveBeenCalled()
        expect(embedKind()).toBe('warning')
    })

    it('accepts another URL form of the playing YouTube video (#2686)', async () => {
        mockResolveGuildQueue.mockReturnValue({
            queue: {
                currentTrack: {
                    title: 'Song',
                    author: 'Artist',
                    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                },
            },
        })
        mockSetFeedback.mockResolvedValue(true)
        await handleFeedback(
            interactionWith('https://youtu.be/dQw4w9WgXcQ?si=abc'),
            {} as never,
        )
        expect(mockSetFeedback).toHaveBeenCalledTimes(1)
        expect(embedKind()).toBe('success')
    })
})
