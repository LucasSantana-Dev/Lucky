import { describe, test, expect, jest, beforeEach } from '@jest/globals'

jest.mock('@lucky/shared/utils', () => ({
    infoLog: jest.fn(),
    errorLog: jest.fn(),
}))

jest.mock('@lucky/shared/constants', () => ({
    COLOR: {
        INFO_GREEN: 0x22c55e,
        LUCKY_PURPLE: 0x7c3aed,
    },
    TOP_GG_VOTE_TIERS: [
        { threshold: 30, label: 'Ultimate' },
        { threshold: 14, label: 'Pro' },
        { threshold: 7, label: 'Supporter' },
        { threshold: 1, label: 'Voter' },
    ],
    TOP_GG_VOTE_URL: 'https://top.gg/bot/962198089161134131/vote',
    tierForVoteStreak: jest.fn((streak: number) => {
        if (streak >= 30) return { threshold: 30, label: 'Ultimate' }
        if (streak >= 14) return { threshold: 14, label: 'Pro' }
        if (streak >= 7) return { threshold: 7, label: 'Supporter' }
        return { threshold: 1, label: 'Voter' }
    }),
}))

const interactionReply = jest.fn() as jest.MockedFunction<
    (args: { interaction: unknown; content: unknown }) => Promise<void>
>
jest.mock('../../../utils/general/interactionReply.js', () => ({
    interactionReply,
}))

import voterewardsCommand from './voterewards.js'

function makeInteraction() {
    return {
        user: { id: 'u1', tag: 'alice#0000' },
        deferReply: jest.fn().mockResolvedValue(undefined),
    }
}

beforeEach(() => {
    interactionReply.mockClear().mockResolvedValue(undefined)
    delete process.env.WEBAPP_BACKEND_URL
    delete process.env.LUCKY_NOTIFY_API_KEY
})

describe('/voterewards', () => {
    test('sends response with vote info', async () => {
        process.env.WEBAPP_BACKEND_URL = 'http://localhost:3000'
        process.env.LUCKY_NOTIFY_API_KEY = 'test-key'

        const interaction = makeInteraction() as never

        await voterewardsCommand.execute({ interaction })

        expect(interactionReply).toHaveBeenCalledTimes(1)
    })

    test('includes tiers in response', async () => {
        process.env.WEBAPP_BACKEND_URL = 'http://localhost:3000'
        process.env.LUCKY_NOTIFY_API_KEY = 'test-key'

        const interaction = makeInteraction() as never

        await voterewardsCommand.execute({ interaction })

        const call = interactionReply.mock.calls[0][0] as {
            content: { embeds?: Array<unknown> }
        }
        expect(Array.isArray(call.content.embeds)).toBe(true)
    })

    test('includes vote URL link', async () => {
        process.env.WEBAPP_BACKEND_URL = 'http://localhost:3000'
        process.env.LUCKY_NOTIFY_API_KEY = 'test-key'

        const interaction = makeInteraction() as never

        await voterewardsCommand.execute({ interaction })

        const call = interactionReply.mock.calls[0][0] as {
            content: { embeds?: Array<{ description?: string }> }
        }
        const embed = call.content.embeds?.[0] as any
        expect(embed?.description).toContain('top.gg')
    })

    test('handles missing backend config gracefully', async () => {
        delete process.env.WEBAPP_BACKEND_URL
        delete process.env.LUCKY_NOTIFY_API_KEY

        const interaction = makeInteraction() as never

        await voterewardsCommand.execute({ interaction })

        expect(interactionReply).toHaveBeenCalledTimes(1)
    })

    test('handles API errors gracefully', async () => {
        process.env.WEBAPP_BACKEND_URL = 'http://localhost:3000'
        process.env.LUCKY_NOTIFY_API_KEY = 'test-key'

        const interaction = makeInteraction() as never

        // Simulate network error by overriding fetch
        global.fetch = jest
            .fn()
            .mockRejectedValueOnce(new Error('Network error'))

        await voterewardsCommand.execute({ interaction })

        expect(interactionReply).toHaveBeenCalledTimes(1)
    })
})
