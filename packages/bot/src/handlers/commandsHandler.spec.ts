import { jest } from '@jest/globals'
import {
    Collection,
    PermissionFlagsBits,
    PermissionsBitField,
} from 'discord.js'
import type { ChatInputCommandInteraction } from 'discord.js'
import {
    executeCommand,
    executeContextMenu,
    setCommands,
    setContextMenus,
    groupCommands,
} from './commandsHandler'
import type { CustomClient } from '../types'
import type Command from '../models/Command'

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    captureException: jest.fn(),
}))

jest.mock('@lucky/shared/utils/alerts', () => ({
    recordWithCooldown: jest.fn().mockReturnValue(false),
    emitAlert: jest.fn().mockImplementation(async () => {}),
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

jest.mock('@lucky/shared/utils/general/errorSanitizer', () => ({
    createUserFriendlyError: jest.fn().mockReturnValue('An error occurred'),
}))

import { errorLog, captureException } from '@lucky/shared/utils'
import { recordWithCooldown, emitAlert } from '@lucky/shared/utils/alerts'
import { featureToggleService } from '@lucky/shared/services'
import { interactionReply } from '../utils/general/interactionReply'
import { monitorCommandExecution } from '../utils/monitoring'
import { createUserFriendlyError } from '@lucky/shared/utils/general/errorSanitizer'

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
        ;(recordWithCooldown as jest.Mock).mockReturnValue(false)
        ;(emitAlert as jest.Mock).mockImplementation(async () => {})
    })

    describe('executeCommand', () => {
        it('should execute a command successfully', async () => {
            const command = createMockCommand()
            const interaction = createMockInteraction()
            const client = createMockClient()
            client.commands.set('test', command)

            await executeCommand({ interaction, client })

            expect(command.execute).toHaveBeenCalledWith({
                interaction,
                client,
            })
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
                message: 'Error executing test:',
                error: expect.any(Error),
            })
            expect(captureException).toHaveBeenCalledWith(
                expect.any(Error),
                expect.objectContaining({
                    context: 'command-execution-failure',
                    command: 'test',
                }),
            )
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
                message: 'Error executing test:',
                error: expect.any(Error),
            })
            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error sending error message:',
                error: expect.any(Error),
            })
        })

        it('wraps a non-Error rejection before capturing it', async () => {
            const command = createMockCommand()
            ;(command.execute as jest.Mock).mockRejectedValue('boom')
            const interaction = createMockInteraction()
            const client = createMockClient()
            client.commands.set('test', command)

            await executeCommand({ interaction, client })

            expect(captureException).toHaveBeenCalledWith(
                expect.any(Error),
                expect.objectContaining({
                    context: 'command-execution-failure',
                }),
            )
        })

        it('should check bot permissions and block command if missing', async () => {
            const command = createMockCommand({
                botPermissions: [PermissionFlagsBits.BanMembers],
            })
            const interaction = createMockInteraction({
                appPermissions: new PermissionsBitField(),
            })
            const client = createMockClient()
            client.commands.set('test', command)

            await executeCommand({ interaction, client })

            expect(interactionReply).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: expect.stringContaining('missing'),
                    ephemeral: true,
                },
            })
            expect(command.execute).not.toHaveBeenCalled()
        })

        it('should allow command if bot has required permissions', async () => {
            const command = createMockCommand({
                botPermissions: [PermissionFlagsBits.BanMembers],
            })
            const interaction = createMockInteraction({
                appPermissions: new PermissionsBitField(
                    PermissionFlagsBits.BanMembers,
                ),
            })
            const client = createMockClient()
            client.commands.set('test', command)

            await executeCommand({ interaction, client })

            expect(command.execute).toHaveBeenCalledWith({
                interaction,
                client,
            })
            expect(interactionReply).not.toHaveBeenCalled()
        })

        it('should allow command without botPermissions check', async () => {
            const command = createMockCommand({ botPermissions: undefined })
            const interaction = createMockInteraction({
                appPermissions: new PermissionsBitField(),
            })
            const client = createMockClient()
            client.commands.set('test', command)

            await executeCommand({ interaction, client })

            expect(command.execute).toHaveBeenCalledWith({
                interaction,
                client,
            })
        })

        it('should handle null appPermissions defensively', async () => {
            const command = createMockCommand({
                botPermissions: [PermissionFlagsBits.BanMembers],
            })
            const interaction = createMockInteraction({
                appPermissions: null,
            })
            const client = createMockClient()
            client.commands.set('test', command)

            await executeCommand({ interaction, client })

            expect(interactionReply).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: expect.stringContaining('missing'),
                    ephemeral: true,
                },
            })
            expect(command.execute).not.toHaveBeenCalled()
        })

        it('should check multiple bot permissions and block if any missing', async () => {
            const command = createMockCommand({
                botPermissions: [
                    PermissionFlagsBits.BanMembers,
                    PermissionFlagsBits.KickMembers,
                ],
            })
            const interaction = createMockInteraction({
                appPermissions: new PermissionsBitField(
                    PermissionFlagsBits.BanMembers,
                ),
            })
            const client = createMockClient()
            client.commands.set('test', command)

            await executeCommand({ interaction, client })

            expect(interactionReply).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: expect.stringContaining('missing'),
                    ephemeral: true,
                },
            })
            expect(command.execute).not.toHaveBeenCalled()
        })

        it('should include permission names in the reply message', async () => {
            const command = createMockCommand({
                botPermissions: [PermissionFlagsBits.BanMembers],
            })
            const interaction = createMockInteraction({
                appPermissions: new PermissionsBitField(),
            })
            const client = createMockClient()
            client.commands.set('test', command)

            await executeCommand({ interaction, client })

            expect(interactionReply).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: expect.stringContaining('BanMembers'),
                    ephemeral: true,
                },
            })
        })
    })

    describe('spam detection', () => {
        it('fires spam alert when recordWithCooldown threshold is crossed', async () => {
            ;(recordWithCooldown as jest.Mock).mockReturnValue(true)
            const command = createMockCommand()
            const interaction = createMockInteraction()
            const client = createMockClient()
            client.commands.set('test', command)

            await executeCommand({ interaction, client })

            expect(emitAlert).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: '⚠️ Command spam detected',
                    color: 'warning',
                }),
            )
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

    describe('executeContextMenu', () => {
        const makeContextMenu = (overrides?: Record<string, unknown>) =>
            ({
                data: { name: 'Move message' },
                category: 'moderation',
                execute: jest.fn().mockResolvedValue(undefined),
                ...overrides,
            }) as any

        const makeCtxInteraction = (overrides?: Record<string, unknown>) =>
            ({
                commandName: 'Move message',
                user: { id: 'user-1' },
                guild: { id: 'guild-1' },
                appPermissions: { has: () => true },
                ...overrides,
            }) as any

        const makeClient = (menu?: unknown) => {
            const client = createMockClient({
                contextMenus: new Collection(),
            } as any)
            if (menu) client.contextMenus.set('Move message', menu as never)
            return client
        }

        it('executes a context menu successfully', async () => {
            const menu = makeContextMenu()
            const interaction = makeCtxInteraction()
            const client = makeClient(menu)

            await executeContextMenu({ interaction, client })

            expect(menu.execute).toHaveBeenCalledWith({ interaction, client })
        })

        it('returns quietly when the context menu is not found', async () => {
            const interaction = makeCtxInteraction()
            const client = makeClient()

            await expect(
                executeContextMenu({ interaction, client }),
            ).resolves.toBeUndefined()
        })

        it('blocks when the category feature is disabled', async () => {
            ;(featureToggleService.isEnabled as jest.Mock).mockResolvedValue(
                false,
            )
            const menu = makeContextMenu()
            const interaction = makeCtxInteraction()
            const client = makeClient(menu)

            await executeContextMenu({ interaction, client })

            expect(menu.execute).not.toHaveBeenCalled()
            expect(interactionReply).toHaveBeenCalled()
        })

        it('blocks when the bot is missing a declared permission', async () => {
            const menu = makeContextMenu({ botPermissions: [8192n] })
            const interaction = makeCtxInteraction({
                appPermissions: { has: () => false },
            })
            const client = makeClient(menu)

            await executeContextMenu({ interaction, client })

            expect(menu.execute).not.toHaveBeenCalled()
        })

        it('reports an error when the context menu throws', async () => {
            const menu = makeContextMenu({
                execute: jest.fn().mockRejectedValue(new Error('boom')),
            })
            const interaction = makeCtxInteraction()
            const client = makeClient(menu)

            await executeContextMenu({ interaction, client })

            expect(captureException).toHaveBeenCalledWith(
                expect.any(Error),
                expect.objectContaining({
                    context: 'context-menu-execution-failure',
                }),
            )
        })
    })

    describe('setContextMenus', () => {
        it('loads named context menus into the client collection', async () => {
            const client = createMockClient({
                contextMenus: new Collection(),
            } as any)
            const menu = { data: { name: 'Move message' } } as any

            await setContextMenus({ client, contextMenus: [menu] })

            expect(client.contextMenus.get('Move message')).toBe(menu)
        })
    })
})
