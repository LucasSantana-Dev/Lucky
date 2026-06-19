import { describe, test, expect, jest, beforeEach } from '@jest/globals'

const infoLog = jest.fn()
const errorLog = jest.fn()
jest.mock('@lucky/shared/utils', () => ({
    infoLog,
    debugLog: jest.fn(),
    errorLog,
}))

jest.mock('@lucky/shared/constants', () => ({
    TOP_GG_VOTE_URL: 'https://top.gg/bot/962198089161134131/vote',
    COLOR: {
        INFO_GREEN: 0x22c55e,
    },
}))

const interactionReply = jest.fn() as jest.MockedFunction<
    (args: { interaction: unknown; content: unknown }) => Promise<void>
>
jest.mock('../../../utils/general/interactionReply.js', () => ({
    interactionReply,
}))

import inviteCommand from './invite.js'

function makeInteraction() {
    return {
        user: { id: 'user-123', tag: 'testuser#0000' },
    }
}

beforeEach(() => {
    interactionReply.mockClear().mockResolvedValue(undefined)
    infoLog.mockClear()
    errorLog.mockClear()
})

describe('/invite', () => {
    test('replies with an embed containing invite URL', async () => {
        const mockClient = {
            application: { id: '962198089161134131' },
            user: { id: '962198089161134131' },
        }
        await inviteCommand.execute({
            client: mockClient as never,
            interaction: makeInteraction() as never,
        })

        expect(interactionReply).toHaveBeenCalledTimes(1)
        const callArg = interactionReply.mock.calls[0][0]
        const args = callArg as {
            content: { embeds?: Array<Record<string, unknown>> }
        }
        const embeds = args.content.embeds

        expect(embeds).toBeDefined()
        expect(embeds).toHaveLength(1)
        const embed = embeds![0]

        expect(embed.title).toBe('🔗 Add Lucky to Your Server')
        expect(typeof embed.description).toBe('string')
        expect(embed.description as string).toContain(
            'https://discord.com/oauth2/authorize?',
        )
    })

    test('includes bot application ID in invite URL', async () => {
        const mockClient = {
            application: { id: '962198089161134131' },
            user: { id: '962198089161134131' },
        }
        await inviteCommand.execute({
            client: mockClient as never,
            interaction: makeInteraction() as never,
        })

        const args = interactionReply.mock.calls[0][0] as {
            content: { embeds?: Array<{ description: unknown }> }
        }
        const description = args.content.embeds?.[0]?.description as string

        expect(description).toContain('client_id=962198089161134131')
    })

    test('includes vote link in embed description', async () => {
        const mockClient = {
            application: { id: '962198089161134131' },
            user: { id: '962198089161134131' },
        }
        await inviteCommand.execute({
            client: mockClient as never,
            interaction: makeInteraction() as never,
        })

        const args = interactionReply.mock.calls[0][0] as {
            content: { embeds?: Array<{ description: unknown }> }
        }
        const description = args.content.embeds?.[0]?.description as string

        expect(description).toContain(
            'https://top.gg/bot/962198089161134131/vote',
        )
    })

    test('includes required permissions in invite URL', async () => {
        const mockClient = {
            application: { id: '962198089161134131' },
            user: { id: '962198089161134131' },
        }
        await inviteCommand.execute({
            client: mockClient as never,
            interaction: makeInteraction() as never,
        })

        const args = interactionReply.mock.calls[0][0] as {
            content: { embeds?: Array<{ description: unknown }> }
        }
        const description = args.content.embeds?.[0]?.description as string

        expect(description).toContain('permissions=')
        expect(description).toContain('scope=bot%20applications.commands')
    })

    test('handles missing application ID gracefully', async () => {
        const mockClient = {
            application: null,
            user: null,
        }
        await inviteCommand.execute({
            client: mockClient as never,
            interaction: makeInteraction() as never,
        })

        expect(interactionReply).toHaveBeenCalledTimes(1)
        const args = interactionReply.mock.calls[0][0] as {
            content: { content: string }
        }

        expect(args.content.content).toContain('Unable to generate invite link')
    })

    test('falls back to client.user.id if application.id is missing', async () => {
        const mockClient = {
            application: null,
            user: { id: '962198089161134131' },
        }
        await inviteCommand.execute({
            client: mockClient as never,
            interaction: makeInteraction() as never,
        })

        expect(interactionReply).toHaveBeenCalledTimes(1)
        const args = interactionReply.mock.calls[0][0] as {
            content: { embeds?: Array<Record<string, unknown>> }
        }
        const embed = args.content.embeds?.[0]

        expect(embed).toBeDefined()
        const description = embed?.description as string
        expect(description).toContain('client_id=962198089161134131')
    })
})
