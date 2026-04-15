import { jest } from '@jest/globals'
import { Collection } from 'discord.js'
import type { ChatInputCommandInteraction } from 'discord.js'
import { executeCommand, setCommands, groupCommands } from './commandsHandler'
import type { CustomClient } from '../types'
import type Command from '../models/Command'

jest.mock('@lucky/shared/utils/general/errorSanitizer', () => ({
    createUserFriendlyError: jest.fn().mockReturnValue('An error occurred'),
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    warnLog: jest.fn(),
    infoLog: jest.fn(),
    errorHandler: jest.fn(),
    captureException: jest.fn(),
}))

jest.mock('@lucky/shared/services', () => ({
    featureToggleService: {
        isEnabled: jest.fn().mockResolvedValue(true),
    },
}))

jest.mock('../utils/general/interactionReply', () => ({
    interactionReply: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../utils/monitoring', () => ({
    monitorCommandExecution: jest.fn(),
}))

import { debugLog, errorLog } from '@lucky/shared/utils'
import { createUserFriendlyError } from '@lucky/shared/utils/general/errorSanitizer'
import { featureToggleService } from '@lucky/shared/services'
import { interactionReply } from '../utils/general/interactionReply'
import { monitorCommandExecution } from '../utils/monitoring'

function createMockCommand(overrides?: Partial<Command>): Command {
    return {
        data: {
            name: 'test',
            description: 'Test command',
        },
        category: 'general',
        execute: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    } as any
}

function createMockInteraction(
    overrides?: Partial<ChatInputCommandInteraction>,
): ChatInputCommandInteraction {
    return {
        commandName: 'test',
        user: { id: 'user-1' },
        guild: { id: 'guild-1' },
        ...overrides,
    } as any
}

function createMockClient(overrides?: Partial<CustomClient>): CustomClient {
    return {
        commands: new Collection(),
        ...overrides,
    } as any
}

describe('commandsHandler', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        ;(featureToggleService.isEnabled as jest.Mock).mockResolvedValue(true)
    })

    describe('executeCommand', () => {
        it('should execute a command successfully', async () => {
            const command = createMockCommand()
            const interaction = createMockInteraction()
            const client = createMockClient()
            client.commands.set('test', command)

            await executeCommand({ interaction, client })

            expect(monitorCommandExecution).toHaveBeenCalledWith(
                'test',
                'user-1',
                'guild-1',
            )
            expect(command.execute).toHaveBeenCalledWith({
                interaction,
                client,
            })
            expect(debugLog).toHaveBeenCalledWith({
                message: 'Executing command: test',
            })
        })

        it('should handle missing command gracefully', async () => {
            const interaction = createMockInteraction()
            const client = createMockClient()

            await executeCommand({ interaction, client })

            expect(debugLog).toHaveBeenCalledWith({
                message: 'Command not found: test',
            })
        })

        it('should check feature toggle for moderation commands', async () => {
            const command = createMockCommand({ category: 'moderation' })
            const interaction = createMockInteraction()
            const client = createMockClient()
            client.commands.set('test', command)

            await executeCommand({ interaction, client })

            expect(featureToggleService.isEnabled).toHaveBeenCalledWith(
                'MODERATION',
                {
                    guildId: 'guild-1',
                    userId: 'user-1',
                },
            )
            expect(command.execute).toHaveBeenCalled()
        })

        it('should check feature toggle for automod commands', async () => {
            const command = createMockCommand({ category: 'automod' })
            const interaction = createMockInteraction()
            const client = createMockClient()
            client.commands.set('test', command)

            await executeCommand({ interaction, client })

            expect(featureToggleService.isEnabled).toHaveBeenCalledWith(
                'AUTOMOD',
                {
                    guildId: 'guild-1',
                    userId: 'user-1',
                },
            )
        })

        it('should check feature toggle for management commands', async () => {
            const command = createMockCommand({ category: 'management' })
            const interaction = createMockInteraction()
            const client = createMockClient()
            client.commands.set('test', command)

            await executeCommand({ interaction, client })

            expect(featureToggleService.isEnabled).toHaveBeenCalledWith(
                'AUTO_MESSAGES',
                {
                    guildId: 'guild-1',
                    userId: 'user-1',
                },
            )
        })

        it('should block command when feature toggle is disabled', async () => {
            ;(featureToggleService.isEnabled as jest.Mock).mockResolvedValue(
                false,
            )
            const command = createMockCommand({ category: 'moderation' })
            const interaction = createMockInteraction()
            const client = createMockClient()
            client.commands.set('test', command)

            await executeCommand({ interaction, client })

            expect(interactionReply).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: 'This feature is currently disabled.',
                    ephemeral: true,
                },
            })
            expect(command.execute).not.toHaveBeenCalled()
        })

        it('should handle interaction without guild', async () => {
            const command = createMockCommand({ category: 'moderation' })
            const interaction = createMockInteraction({ guild: null })
            const client = createMockClient()
            client.commands.set('test', command)

            await executeCommand({ interaction, client })

            expect(featureToggleService.isEnabled).toHaveBeenCalledWith(
                'MODERATION',
                {
                    guildId: undefined,
                    userId: 'user-1',
                },
            )
        })

        it('should handle command execution errors', async () => {
            const command = createMockCommand()
            ;(command.execute as jest.Mock).mockRejectedValue(
                new Error('Command failed'),
            )
            ;(createUserFriendlyError as jest.Mock).mockReturnValue(
                'An error occurred',
            )
            const interaction = createMockInteraction()
            const client = createMockClient()
            client.commands.set('test', command)

            await executeCommand({ interaction, client })

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error executing command test:',
                error: expect.any(Error),
            })
            expect(createUserFriendlyError).toHaveBeenCalledWith(
                expect.any(Error),
            )
            expect(interactionReply).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: 'An error occurred',
                    ephemeral: true,
                },
            })
        })

        it('should handle error reply failures', async () => {
            const command = createMockCommand()
            ;(command.execute as jest.Mock).mockRejectedValue(
                new Error('Command failed'),
            )
            ;(interactionReply as jest.Mock).mockRejectedValue(
                new Error('Reply failed'),
            )
            const interaction = createMockInteraction()
            const client = createMockClient()
            client.commands.set('test', command)

            await executeCommand({ interaction, client })

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error executing command test:',
                error: expect.any(Error),
            })
            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error sending error message:',
                error: expect.any(Error),
            })
        })
    })

    describe('setCommands', () => {
        it('should set commands in client collection', async () => {
            const commands = [
                createMockCommand({ data: { name: 'ping' } }),
                createMockCommand({ data: { name: 'help' } }),
                createMockCommand({ data: { name: 'stats' } }),
            ]
            const client = createMockClient()

            await setCommands({ client, commands })

            expect(client.commands.size).toBe(3)
            expect(client.commands.has('ping')).toBe(true)
            expect(client.commands.has('help')).toBe(true)
            expect(client.commands.has('stats')).toBe(true)
            expect(debugLog).toHaveBeenCalledWith({
                message: 'Setting commands in client collection...',
            })
            expect(debugLog).toHaveBeenCalledWith({
                message: 'Loaded 3 commands',
            })
        })

        it('should skip commands without name', async () => {
            const commands = [
                createMockCommand({ data: { name: 'ping' } }),
                createMockCommand({ data: { name: '' } }),
                createMockCommand({ data: { name: 'help' } }),
            ]
            const client = createMockClient()

            await setCommands({ client, commands })

            expect(client.commands.size).toBe(2)
            expect(client.commands.has('ping')).toBe(true)
            expect(client.commands.has('help')).toBe(true)
        })

        it('should clear existing commands before setting new ones', async () => {
            const client = createMockClient()
            client.commands.set('old', createMockCommand())

            const commands = [createMockCommand({ data: { name: 'new' } })]

            await setCommands({ client, commands })

            expect(client.commands.size).toBe(1)
            expect(client.commands.has('old')).toBe(false)
            expect(client.commands.has('new')).toBe(true)
        })

        it('should handle errors during command setting', async () => {
            const commands = [
                {
                    data: {
                        get name() {
                            throw new Error('Name getter error')
                        },
                    },
                    execute: jest.fn(),
                },
            ] as any
            const client = createMockClient()

            await expect(setCommands({ client, commands })).rejects.toThrow()

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error setting commands:',
                error: expect.any(Error),
            })
        })

        it('should handle empty commands array', async () => {
            const client = createMockClient()

            await setCommands({ client, commands: [] })

            expect(client.commands.size).toBe(0)
            expect(debugLog).toHaveBeenCalledWith({
                message: 'Loaded 0 commands',
            })
        })
    })

    describe('groupCommands', () => {
        it('should return valid commands', () => {
            const commands = [
                createMockCommand({ data: { name: 'ping' } }),
                createMockCommand({ data: { name: 'help' } }),
            ]

            const result = groupCommands({ commands })

            expect(result).toHaveLength(2)
            expect(result).toEqual(commands)
        })

        it('should filter out commands without name', () => {
            const commands = [
                createMockCommand({ data: { name: 'ping' } }),
                createMockCommand({ data: { name: '' } }),
                createMockCommand({ data: { name: 'help' } }),
            ]

            const result = groupCommands({ commands })

            expect(result).toHaveLength(2)
            expect(result[0].data.name).toBe('ping')
            expect(result[1].data.name).toBe('help')
            expect(errorLog).toHaveBeenCalledWith({
                message: 'Invalid command found during grouping: unknown',
            })
        })

        it('should filter out commands without execute function', () => {
            const commands = [
                createMockCommand({ data: { name: 'ping' } }),
                { data: { name: 'invalid' }, category: 'general' },
                createMockCommand({ data: { name: 'help' } }),
            ] as any

            const result = groupCommands({ commands })

            expect(result).toHaveLength(2)
            expect(result[0].data.name).toBe('ping')
            expect(result[1].data.name).toBe('help')
            expect(errorLog).toHaveBeenCalledWith({
                message: 'Invalid command found during grouping: invalid',
            })
        })

        it('should handle commands with null data', () => {
            const commands = [
                createMockCommand({ data: { name: 'ping' } }),
                { data: null, category: 'general', execute: jest.fn() },
                createMockCommand({ data: { name: 'help' } }),
            ] as any

            const result = groupCommands({ commands })

            expect(result).toHaveLength(2)
            expect(errorLog).toHaveBeenCalledWith({
                message: 'Invalid command found during grouping: unknown',
            })
        })

        it('should handle errors during grouping', () => {
            const commands = [createMockCommand({ data: { name: 'ping' } })]

            Object.defineProperty(commands, 'filter', {
                get: () => {
                    throw new Error('Filter error')
                },
            })

            const result = groupCommands({ commands })

            expect(result).toEqual([])
            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error grouping commands:',
                error: expect.any(Error),
            })
        })

        it('should return empty array for empty input', () => {
            const result = groupCommands({ commands: [] })

            expect(result).toEqual([])
        })

        it('should filter out completely invalid command objects', () => {
            const commands = [
                createMockCommand({ data: { name: 'valid' } }),
                null,
                undefined,
                {},
            ] as any

            const result = groupCommands({ commands })

            expect(result).toHaveLength(1)
            expect(result[0].data.name).toBe('valid')
        })
    })
})
