import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { ChatInputCommandInteraction } from 'discord.js'

const interactionReplyMock = jest.fn()
const errorLogMock = jest.fn()
const infoLogMock = jest.fn()
const customCommandServiceMock = {
    getCommand: jest.fn(),
    listCommands: jest.fn(),
    deleteCommand: jest.fn(),
    createCommand: jest.fn(),
    updateCommand: jest.fn(),
}

jest.mock('../../../utils/general/interactionReply.js', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: unknown[]) => errorLogMock(...args),
    infoLog: (...args: unknown[]) => infoLogMock(...args),
}))

jest.mock('@lucky/shared/services', () => ({
    customCommandService: customCommandServiceMock,
}))

// Import after mocks are set up
import customcommandCommand from './customcommand.js'

function createChatInputInteraction(
    subcommand: string,
    options: Record<string, unknown> = {},
): ChatInputCommandInteraction {
    const mockInteraction = {
        guild: {
            id: 'guild-123',
            name: 'Test Guild',
        },
        user: {
            id: 'user-123',
            tag: 'testuser#0001',
        },
        options: {
            getSubcommand: jest.fn().mockReturnValue(subcommand),
            getString: jest.fn((key: string, required?: boolean) => {
                const val = options[key]
                return typeof val === 'string' ? val : null
            }),
        },
    } as unknown as ChatInputCommandInteraction

    return mockInteraction
}

describe('customcommand command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        interactionReplyMock.mockResolvedValue(undefined)
        customCommandServiceMock.getCommand.mockResolvedValue(null)
        customCommandServiceMock.listCommands.mockResolvedValue([])
        customCommandServiceMock.deleteCommand.mockResolvedValue(undefined)
        customCommandServiceMock.createCommand.mockResolvedValue({
            id: 'cmd-1',
            guildId: 'guild-123',
            name: 'test',
            response: 'Test response',
            description: 'A test command',
            embedData: null,
            allowedRoles: [],
            allowedChannels: [],
            enabled: true,
            useCount: 0,
            createdBy: 'user-123',
            createdAt: new Date(),
            updatedAt: new Date(),
            lastUsed: null,
        })
        customCommandServiceMock.updateCommand.mockResolvedValue({
            id: 'cmd-1',
            guildId: 'guild-123',
            name: 'test',
            response: 'Updated response',
            description: 'Updated description',
            embedData: null,
            allowedRoles: [],
            allowedChannels: [],
            enabled: true,
            useCount: 5,
            createdBy: 'user-123',
            createdAt: new Date(),
            updatedAt: new Date(),
            lastUsed: new Date(),
        })
    })

    describe('command metadata', () => {
        it('defines command with correct name, description, and permissions', () => {
            expect(customcommandCommand.data.name).toBe('customcommand')
            expect(customcommandCommand.data.description).toBe(
                'Manage custom commands',
            )
            expect(customcommandCommand.category).toBe('management')
            expect(
                customcommandCommand.data.default_member_permissions,
            ).toBeDefined()
        })
    })

    describe('guild validation', () => {
        it('rejects command when used outside of a guild', async () => {
            const interaction = createChatInputInteraction('create')
            interaction.guild = null

            await customcommandCommand.execute({ interaction })

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: '❌ This command can only be used in a server.',
                },
            })
        })
    })

    describe('create subcommand', () => {
        it.each<[string, Record<string, unknown>, boolean]>([
            [
                'hello',
                {
                    name: 'hello',
                    response: 'Hello world!',
                    description: 'Says hello',
                },
                true,
            ],
            ['HelloWorld', { name: 'HelloWorld', response: 'Test' }, true],
            ['long', { name: 'long', response: 'x'.repeat(150) }, true],
        ])(
            'creates command with name=%s and handles normalization and truncation',
            async (inputName, opts, shouldCreate) => {
                customCommandServiceMock.getCommand.mockResolvedValue(null)
                const interaction = createChatInputInteraction('create', opts)
                const normalized = inputName.toLowerCase()

                await customcommandCommand.execute({ interaction })

                expect(
                    customCommandServiceMock.getCommand,
                ).toHaveBeenCalledWith('guild-123', normalized)
                if (shouldCreate) {
                    expect(
                        customCommandServiceMock.createCommand,
                    ).toHaveBeenCalledWith(
                        'guild-123',
                        normalized,
                        expect.any(String),
                        expect.any(Object),
                    )
                    expect(interactionReplyMock).toHaveBeenCalledWith({
                        interaction,
                        content: {
                            embeds: expect.any(Array),
                        },
                    })
                }
            },
        )

        it('rejects duplicate or invalid command names', async () => {
            customCommandServiceMock.getCommand.mockResolvedValue({
                id: 'cmd-1',
                name: 'existing',
                guildId: 'guild-123',
                response: 'Existing response',
                description: null,
                embedData: null,
                allowedRoles: [],
                allowedChannels: [],
                enabled: true,
                useCount: 0,
                createdBy: 'user-123',
                createdAt: new Date(),
                updatedAt: new Date(),
                lastUsed: null,
            })

            const interaction = createChatInputInteraction('create', {
                name: 'existing',
                response: 'New response',
            })

            await customcommandCommand.execute({ interaction })

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: '❌ A command named `existing` already exists.',
                },
            })
            expect(
                customCommandServiceMock.createCommand,
            ).not.toHaveBeenCalled()
        })
    })

    describe('edit/delete/info subcommands', () => {
        it.each<[string, Record<string, unknown>, boolean]>([
            ['edit: greet', { name: 'greet', response: 'New greeting!' }, true],
            ['delete: test', { name: 'test' }, false],
        ])(
            'handles subcommand %s with normalization',
            async (_, opts, isEdit) => {
                const name = (opts.name as string).toLowerCase()
                customCommandServiceMock.getCommand.mockResolvedValue({
                    id: 'cmd-1',
                    name,
                    guildId: 'guild-123',
                    response: 'Response',
                    description: null,
                    embedData: null,
                    allowedRoles: [],
                    allowedChannels: [],
                    enabled: true,
                    useCount: 0,
                    createdBy: 'user-123',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    lastUsed: null,
                })

                const subcommand = isEdit ? 'edit' : 'delete'
                const interaction = createChatInputInteraction(subcommand, opts)

                await customcommandCommand.execute({ interaction })

                expect(
                    customCommandServiceMock.getCommand,
                ).toHaveBeenCalledWith('guild-123', name)
                expect(interactionReplyMock).toHaveBeenCalledWith({
                    interaction,
                    content: {
                        embeds: expect.any(Array),
                    },
                })
            },
        )

        it('rejects operations on non-existent commands', async () => {
            customCommandServiceMock.getCommand.mockResolvedValue(null)

            const interaction = createChatInputInteraction('edit', {
                name: 'nonexistent',
                response: 'New response',
            })

            await customcommandCommand.execute({ interaction })

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: '❌ Command `nonexistent` not found.',
                },
            })
            expect(
                customCommandServiceMock.updateCommand,
            ).not.toHaveBeenCalled()
        })
    })

    describe('list subcommand', () => {
        it.each<[string, any[]]>([
            [
                'with commands',
                [
                    {
                        id: '1',
                        name: 'hello',
                        guildId: 'guild-123',
                        response: 'Hello response',
                        description: 'A greeting',
                        useCount: 10,
                        embedData: null,
                        allowedRoles: [],
                        allowedChannels: [],
                        enabled: true,
                        createdBy: 'user-123',
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        lastUsed: new Date(),
                    },
                ],
            ],
            ['empty', []],
        ])('lists commands %s', async (scenario, commands) => {
            customCommandServiceMock.listCommands.mockResolvedValue(commands)
            const interaction = createChatInputInteraction('list')

            await customcommandCommand.execute({ interaction })

            expect(customCommandServiceMock.listCommands).toHaveBeenCalledWith(
                'guild-123',
            )
            expect(interactionReplyMock).toHaveBeenCalled()
        })
    })

    describe('info subcommand', () => {
        it('displays detailed info about a command', async () => {
            customCommandServiceMock.getCommand.mockResolvedValue({
                id: 'cmd-1',
                name: 'test',
                guildId: 'guild-123',
                response: 'Test response',
                description: 'A test command',
                useCount: 15,
                embedData: null,
                allowedRoles: ['role-1', 'role-2'],
                allowedChannels: [],
                enabled: true,
                createdBy: 'user-123',
                createdAt: new Date('2026-01-15'),
                updatedAt: new Date(),
                lastUsed: new Date('2026-05-20'),
            })

            const interaction = createChatInputInteraction('info', {
                name: 'test',
            })

            await customcommandCommand.execute({ interaction })

            expect(customCommandServiceMock.getCommand).toHaveBeenCalledWith(
                'guild-123',
                'test',
            )
            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    embeds: expect.any(Array),
                },
            })
        })
    })

    describe('error handling', () => {
        it('catches service errors and replies with error message', async () => {
            const error = new Error('Service error')
            customCommandServiceMock.listCommands.mockRejectedValue(error)

            const interaction = createChatInputInteraction('list')

            await customcommandCommand.execute({ interaction })

            expect(errorLogMock).toHaveBeenCalled()
            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    content:
                        '❌ Failed to manage custom command. Please try again.',
                },
            })
        })
    })
})
