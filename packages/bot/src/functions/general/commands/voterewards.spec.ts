import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const interactionReplyMock = jest.fn<() => Promise<void>>()
const infoLogMock = jest.fn()
const errorLogMock = jest.fn()

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    infoLog: (...args: unknown[]) => infoLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

import voterewardsCommand from './voterewards'

const fetchMock = jest.fn<typeof fetch>()

function makeInteraction() {
    return {
        user: {
            id: '1234567890',
            tag: 'lucky-user#0001',
        },
    } as unknown as Parameters<
        typeof voterewardsCommand.execute
    >[0]['interaction']
}

function latestReply() {
    const call = interactionReplyMock.mock.calls.at(-1)
    if (!call) throw new Error('interactionReply was not called')
    return call[0] as {
        content: {
            embeds: Array<{
                title?: string
                description?: string
                url?: string
                fields?: Array<{
                    name: string
                    value: string
                    inline?: boolean
                }>
                footer?: { text: string }
            }>
        }
    }
}

describe('voterewards command', () => {
    const originalFetch = global.fetch

    beforeEach(() => {
        jest.clearAllMocks()
        process.env.WEBAPP_BACKEND_URL = 'https://api.lucky.test/base'
        process.env.LUCKY_NOTIFY_API_KEY = 'notify-key'
        global.fetch = fetchMock
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({
                hasVoted: false,
                streak: 0,
                nextVoteInSeconds: 0,
            }),
        } as Response)
    })

    afterEach(() => {
        global.fetch = originalFetch
        delete process.env.WEBAPP_BACKEND_URL
        delete process.env.LUCKY_NOTIFY_API_KEY
    })

    it('has the expected command metadata', () => {
        expect(voterewardsCommand.data.name).toBe('voterewards')
        expect(voterewardsCommand.category).toBe('general')
    })

    it('shows the offline vote CTA when backend configuration is missing', async () => {
        delete process.env.WEBAPP_BACKEND_URL

        await voterewardsCommand.execute({
            interaction: makeInteraction(),
        } as never)

        expect(fetchMock).not.toHaveBeenCalled()
        const embed = latestReply().content.embeds[0]
        expect(embed.title).toBe('💛 Vote for Lucky on top.gg')
        expect(embed.description).toContain(
            'https://top.gg/bot/962198089161134131/vote',
        )
        expect(embed.footer?.text).toContain('Vote tracking is offline')
    })

    it('fetches vote state with the internal key and a request timeout', async () => {
        await voterewardsCommand.execute({
            interaction: makeInteraction(),
        } as never)

        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.lucky.test/api/internal/votes/1234567890',
            {
                headers: { 'x-notify-key': 'notify-key' },
                signal: expect.any(AbortSignal),
            },
        )
    })

    it('renders the current tier and next tier for a 14-vote streak', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                hasVoted: true,
                streak: 14,
                nextVoteInSeconds: 7200,
            }),
        } as Response)

        await voterewardsCommand.execute({
            interaction: makeInteraction(),
        } as never)

        const embed = latestReply().content.embeds[0]
        expect(embed.title).toBe('💛 Lucky Vote Rewards')
        expect(embed.description).toContain('Lucky Regular')
        expect(embed.description).toContain('next vote in 2h 0m')
        expect(embed.fields).toContainEqual(
            expect.objectContaining({
                name: 'Next tier',
                value: 'Lucky Legend at 30',
            }),
        )
    })

    it('rounds sub-minute vote countdowns up to one minute', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                hasVoted: true,
                streak: 1,
                nextVoteInSeconds: 59,
            }),
        } as Response)

        await voterewardsCommand.execute({
            interaction: makeInteraction(),
        } as never)

        expect(latestReply().content.embeds[0].description).toContain(
            'next vote in 1m',
        )
    })

    it('falls back to the vote CTA when the backend request fails', async () => {
        fetchMock.mockRejectedValueOnce(new Error('network down'))

        await voterewardsCommand.execute({
            interaction: makeInteraction(),
        } as never)

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'voterewards: failed to fetch vote state',
            }),
        )
        expect(latestReply().content.embeds[0].title).toBe(
            '💛 Vote for Lucky on top.gg',
        )
    })
})
