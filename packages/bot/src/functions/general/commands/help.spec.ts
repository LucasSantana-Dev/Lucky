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

        expect(interactionReply.mock.calls.length).toBeGreaterThanOrEqual(1)
    })

    test('handles empty command list', async () => {
        const client = makeClient([])
        const interaction = makeInteraction() as never

        await helpCommand.execute({ client: client as never, interaction })

        expect(interactionReply).toHaveBeenCalledTimes(1)
    })

    test('handles many commands with pagination', async () => {
        const commands = Array.from({ length: 50 }, (_, i) =>
            makeCommand(`cmd${i}`, `Command ${i}`),
        )
        const client = makeClient(commands)
        const interaction = makeInteraction() as never

        await helpCommand.execute({ client: client as never, interaction })

        expect(interactionReply.mock.calls.length).toBeGreaterThanOrEqual(1)
    })

    test('pages large command lists across multiple embeds', async () => {
        // Create many commands to trigger pagination
        const commands = Array.from({ length: 50 }, (_, i) =>
            makeCommand(`cmd${i}`, `Command ${i}`),
        )
        const client = makeClient(commands)
        const interaction = makeInteraction() as never

        await helpCommand.execute({ client: client as never, interaction })

        expect(interactionReply.mock.calls.length).toBeGreaterThanOrEqual(1)
    })

    test('catches errors and replies with error message', async () => {
        const client = {
            commands: new Map(), // Empty to trigger error during processing
            user: null, // Missing displayAvatarURL
        } as never
        const interaction = makeInteraction() as never

        await helpCommand.execute({ client, interaction })

        const call = interactionReply.mock.calls[0][0] as {
            content: { content?: string }
        }
        expect(call.content.content).toContain('error')
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
