import { describe, test, expect, jest, beforeEach } from '@jest/globals'

jest.mock('@lucky/shared/utils', () => ({
    infoLog: jest.fn(),
    debugLog: jest.fn(),
    errorLog: jest.fn(),
}))

const interactionReply = jest.fn() as jest.MockedFunction<
    (args: { interaction: unknown; content: unknown }) => Promise<void>
>
jest.mock('../../../utils/general/interactionReply.js', () => ({
    interactionReply,
}))

import socialCommand from './social.js'

function makeInteraction(subcommand: string, target?: { id: string; username: string; displayName?: string }) {
    return {
        user: { id: 'sender-1', username: 'alice', displayName: 'Alice', tag: 'alice#0' },
        options: {
            getSubcommand: () => subcommand,
            getUser: () => target ?? null,
        },
    }
}

beforeEach(() => {
    interactionReply.mockClear().mockResolvedValue(undefined)
})

describe('/social', () => {
    test.each(['hug', 'pat', 'kiss', 'dance', 'bonk', 'wave'])(
        'replies with an embed for %s (self-use)',
        async (action) => {
            await socialCommand.execute({
                interaction: makeInteraction(action) as never,
            })
            expect(interactionReply).toHaveBeenCalledTimes(1)
            const args = interactionReply.mock.calls[0][0] as {
                content: { embeds: Array<Record<string, unknown>> }
            }
            const embed = args.content.embeds[0]
            expect(embed).toBeDefined()
            expect(typeof embed.description).toBe('string')
            expect(typeof embed.image).toBe('object')
        },
    )

    test('uses target user in phrase when provided', async () => {
        await socialCommand.execute({
            interaction: makeInteraction('hug', {
                id: 'target-1',
                username: 'bob',
                displayName: 'Bob',
            }) as never,
        })
        const args = interactionReply.mock.calls[0][0] as {
            content: { embeds: Array<{ description: string }> }
        }
        const embed = args.content.embeds[0]
        expect(embed.description).toContain('Alice')
        expect(embed.description).toContain('Bob')
    })

    test('self-targeting triggers self-phrase', async () => {
        await socialCommand.execute({
            interaction: makeInteraction('kiss', {
                id: 'sender-1',
                username: 'alice',
                displayName: 'Alice',
            }) as never,
        })
        const args = interactionReply.mock.calls[0][0] as {
            content: { embeds: Array<{ description: string }> }
        }
        expect(args.content.embeds[0].description).toMatch(/themself|mirror/)
    })

    test('rejects unknown subcommand', async () => {
        await socialCommand.execute({
            interaction: makeInteraction('slap') as never,
        })
        const args = interactionReply.mock.calls[0][0] as {
            content: { content: string }
        }
        expect(args.content.content).toContain('Unknown')
    })
})
