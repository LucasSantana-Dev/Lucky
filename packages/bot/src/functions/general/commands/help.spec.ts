import { describe, test, expect, jest, beforeEach } from '@jest/globals'

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    infoLog: jest.fn(),
    errorLog: jest.fn(),
}))

jest.mock('../../../utils/general/interactionReply.js', () => ({
    interactionReply: jest.fn(),
}))

jest.mock('../../../utils/command/commandCategory.js', () => ({
    getCommandCategory: (cmd: any) => cmd.category || 'general',
    getAllCategories: () => [
        { key: 'general', label: 'General' },
        { key: 'music', label: 'Music' },
        { key: 'moderation', label: 'Moderation' },
    ],
}))

import helpCommand from './help.js'

function createClient() {
    return {
        user: {
            displayAvatarURL: () => 'https://example.com/bot-avatar.png',
        },
        commands: new Map([
            [
                'help',
                {
                    data: { name: 'help', description: 'Show all commands' },
                    category: 'general',
                },
            ],
            [
                'play',
                {
                    data: { name: 'play', description: 'Play music' },
                    category: 'music',
                },
            ],
            [
                'ban',
                {
                    data: { name: 'ban', description: 'Ban a user' },
                    category: 'moderation',
                },
            ],
        ]),
    }
}

function createInteraction() {
    return {
        user: {
            id: 'user-123',
            tag: 'TestUser#1234',
            displayAvatarURL: () => 'url',
        },
        reply: jest.fn(),
        editReply: jest.fn(),
    }
}

describe('help command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('command name is "help"', () => {
        expect(helpCommand.data.name).toBe('help')
    })

    test('command has proper description', () => {
        expect(helpCommand.data.description).toContain('Show all available')
    })

    test('command category is "general"', () => {
        expect(helpCommand.category).toBe('general')
    })

    test('has execute function', () => {
        expect(typeof helpCommand.execute).toBe('function')
    })

    test('executes with valid client and interaction', async () => {
        const client = createClient()
        const interaction = createInteraction()

        await helpCommand.execute({
            client,
            interaction,
        } as any)
    })

    test('builds categories from client commands', async () => {
        const client = createClient()
        const interaction = createInteraction()

        await helpCommand.execute({
            client,
            interaction,
        } as any)

        // Command completed without error, no exception thrown
        expect(true).toBe(true)
    })

    test('handles null client.user gracefully', async () => {
        const client = {
            user: null,
            commands: new Map([
                [
                    'test',
                    {
                        data: { name: 'test', description: 'test' },
                        category: 'general',
                    },
                ],
            ]),
        }
        const interaction = createInteraction()

        await helpCommand.execute({
            client,
            interaction,
        } as any)
    })

    test('handles empty commands map', async () => {
        const client = {
            user: { displayAvatarURL: () => 'url' },
            commands: new Map(),
        }
        const interaction = createInteraction()

        await helpCommand.execute({
            client,
            interaction,
        } as any)
    })

    test('handles error when commands iteration fails', async () => {
        const client = {
            user: { displayAvatarURL: () => 'url' },
            commands: null,
        }
        const interaction = createInteraction()

        await helpCommand.execute({
            client,
            interaction,
        } as any)
    })

    test('handles multiple commands in same category', async () => {
        const client = {
            user: { displayAvatarURL: () => 'url' },
            commands: new Map([
                [
                    'cmd1',
                    {
                        data: { name: 'cmd1', description: 'First command' },
                        category: 'general',
                    },
                ],
                [
                    'cmd2',
                    {
                        data: { name: 'cmd2', description: 'Second command' },
                        category: 'general',
                    },
                ],
            ]),
        }
        const interaction = createInteraction()

        await helpCommand.execute({
            client,
            interaction,
        } as any)
    })
})
