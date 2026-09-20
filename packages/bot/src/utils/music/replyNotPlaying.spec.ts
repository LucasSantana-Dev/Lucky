import { describe, expect, it, jest, beforeEach } from '@jest/globals'

jest.mock('../general/interactionReply', () => ({
    interactionReply: jest.fn(),
}))

jest.mock('../general/embeds', () => ({
    createErrorEmbed: jest.fn((title: string, description?: string) => ({
        title,
        description,
    })),
}))

import { replyNotPlaying } from './replyNotPlaying'
import { interactionReply } from '../general/interactionReply'
import { messages } from '../general/messages'

describe('replyNotPlaying', () => {
    beforeEach(() => jest.clearAllMocks())

    it('replies with the shared notPlaying message', async () => {
        const interaction = { id: 'i1' }

        await replyNotPlaying(interaction as never)

        const call = (interactionReply as jest.Mock).mock.calls[0][0] as {
            interaction: unknown
            content: { embeds: { title: string; description: string }[] }
        }
        expect(call.interaction).toBe(interaction)
        expect(call.content.embeds[0].title).toBe('Error')
        // Sourced from messages.ts rather than a hardcoded literal, so the two
        // call sites cannot drift apart again (#1970).
        expect(call.content.embeds[0].description).toBe(
            messages.error.notPlaying,
        )
    })
})
