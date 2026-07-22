import { describe, test, expect, jest, beforeEach } from '@jest/globals'

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    infoLog: jest.fn(),
    errorLog: jest.fn(),
}))

const interactionReply = jest.fn() as jest.MockedFunction<
    (args: { interaction: unknown; content: unknown }) => Promise<void>
>
jest.mock('../../../utils/general/interactionReply.js', () => ({
    interactionReply,
}))

jest.mock('../../../utils/command/commandCategory.js', () => ({
    getCommandCategory: (cmd: { category?: string }) =>
        cmd.category ?? 'general',
    getAllCategories: () => [
        { key: 'general', label: 'General' },
        { key: 'music', label: 'Music' },
    ],
}))

jest.mock('../../../utils/general/embeds.js', () => ({
    EMBED_COLORS: { INFO: 0x3b82f6 },
}))

import { errorLog } from '@lucky/shared/utils'
import helpCommand from './help.js'

function makeCommand(name: string, description: string, category = 'general') {
    return {
        category,
        data: { name, description },
    }
}

function makeInteraction() {
    return {
        user: {
            id: 'u1',
            tag: 'alice#0000',
            displayAvatarURL: () => 'https://example.com/avatar.png',
        },
        options: {},
    }
}

function makeClient(commands: unknown[]) {
    return {
        user: {
            displayAvatarURL: () => 'https://example.com/bot-avatar.png',
        },
        commands: new Map(commands.map((cmd: any) => [cmd.data.name, cmd])),
    }
}

beforeEach(() => {
    interactionReply.mockClear().mockResolvedValue(undefined)
    ;(errorLog as jest.Mock).mockClear()
})

describe('/help', () => {
    test('sends at least one message via interactionReply', async () => {
        const client = makeClient([
            makeCommand('ping', 'Check latency'),
            makeCommand('version', 'Show version'),
        ])
        const interaction = makeInteraction() as never

        await helpCommand.execute({ client: client as never, interaction })

        expect(interactionReply).toHaveBeenCalledTimes(1)
    })

    test('calls interactionReply for each embed page', async () => {
        const client = makeClient([makeCommand('ping', 'Check latency')])
        const interaction = makeInteraction() as never

        await helpCommand.execute({ client: client as never, interaction })

        // A single command fits on one page: exactly one reply, no pagination.
        expect(interactionReply.mock.calls.length).toBeGreaterThanOrEqual(1)
        expect(interactionReply).toHaveBeenCalledTimes(1)
    })

    test('handles empty command list', async () => {
        const client = makeClient([])
        const interaction = makeInteraction() as never

        await helpCommand.execute({ client: client as never, interaction })

        expect(interactionReply).toHaveBeenCalledTimes(1)
    })

    test('handles many commands with pagination', async () => {
        // Enough long command lines to exceed the per-page character budget
        // in help.ts (PAGE_CHAR_BUDGET), forcing more than one embed page.
        const commands = Array.from({ length: 250 }, (_, i) =>
            makeCommand(
                `cmd${i}`,
                `Description for command number ${i} that is long enough to fill pages`,
            ),
        )
        const client = makeClient(commands)
        const interaction = makeInteraction() as never

        await helpCommand.execute({ client: client as never, interaction })

        expect(interactionReply.mock.calls.length).toBeGreaterThan(1)
    })

    test('pages large command lists across multiple embeds', async () => {
        const commands = Array.from({ length: 250 }, (_, i) =>
            makeCommand(
                `cmd${i}`,
                `Description for command number ${i} that is long enough to fill pages`,
            ),
        )
        const client = makeClient(commands)
        const interaction = makeInteraction() as never

        await helpCommand.execute({ client: client as never, interaction })

        const calls = interactionReply.mock.calls
        expect(calls.length).toBeGreaterThan(1)
        // The first page title carries the "1/N" page counter when paginated.
        const firstCall = calls[0][0] as {
            content: { embeds: Array<{ data: { title?: string } }> }
        }
        expect(firstCall.content.embeds[0].data.title).toContain(
            `1/${calls.length}`,
        )
    })

    test('catches errors and replies with error message', async () => {
        const client = makeClient([makeCommand('ping', 'Check latency')])
        // Force a real exception inside help.ts: the footer builder calls
        // interaction.user.displayAvatarURL() while rendering the first page.
        const interaction = {
            ...makeInteraction(),
            user: {
                id: 'u1',
                tag: 'alice#0000',
                displayAvatarURL: () => {
                    throw new Error('avatar unavailable')
                },
            },
        } as never

        await helpCommand.execute({ client: client as never, interaction })

        // The catch block sends exactly one reply: the error message.
        expect(interactionReply).toHaveBeenCalledTimes(1)
        const call = interactionReply.mock.calls[0][0] as {
            content: { content?: string }
        }
        expect(call.content.content).toContain('error')
        expect(errorLog).toHaveBeenCalled()
    })

    test('handles empty command list', async () => {
        const client = makeClient([])
        const interaction = makeInteraction() as never

        await helpCommand.execute({ client: client as never, interaction })

        expect(interactionReply).toHaveBeenCalledTimes(1)
        const call = interactionReply.mock.calls[0][0] as {
            content: { embeds?: unknown[] }
        }
        expect(Array.isArray(call.content.embeds)).toBe(true)
    })
})
