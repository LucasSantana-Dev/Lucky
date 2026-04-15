import { jest } from '@jest/globals'
import { Events, InteractionType } from 'discord.js'
import type {
    ChatInputCommandInteraction,
    ButtonInteraction,
    Interaction,
} from 'discord.js'
import {
    handleInteractions,
    handleInteraction,
    interactionGetAllOptions,
    interactionGetOption,
    interactionGetSubcommand,
} from './interactionHandler'
import type { CustomClient } from '../types'

jest.mock('@lucky/shared/utils', () => ({
    ...jest.requireActual('@lucky/shared/utils'),
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    createUserFriendlyError: jest.fn(),
}))

jest.mock('./commandsHandler', () => ({
    executeCommand: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('./musicButtonHandler', () => ({
    handleMusicButtonInteraction: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@lucky/shared/services', () => ({
    reactionRolesService: {
        handleButtonInteraction: jest.fn().mockResolvedValue(undefined),
    },
}))

jest.mock('../utils/general/embeds', () => ({
    errorEmbed: jest.fn().mockReturnValue({ title: 'Error' }),
}))

jest.mock('../utils/general/interactionReply', () => ({
    interactionReply: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../utils/monitoring', () => ({
    monitorInteractionHandling: jest.fn(),
}))

import { debugLog, errorLog } from '@lucky/shared/utils'
import { executeCommand } from './commandsHandler'
import { handleMusicButtonInteraction } from './musicButtonHandler'
import { reactionRolesService } from '@lucky/shared/services'
import { errorEmbed } from '../utils/general/embeds'
import { interactionReply } from '../utils/general/interactionReply'
import { monitorInteractionHandling } from '../utils/monitoring'
import { createUserFriendlyError } from '@lucky/shared/utils'

function createMockClient(): CustomClient & {
    eventHandlers: Map<string, Function[]>
} {
    const eventHandlers = new Map<string, Function[]>()

    const client = {
        on: jest.fn((event: string, handler: Function) => {
            if (!eventHandlers.has(event)) {
                eventHandlers.set(event, [])
            }
            eventHandlers.get(event)?.push(handler)
            return client
        }),
        eventHandlers,
    } as any

    return client
}

async function triggerEvent(
    client: ReturnType<typeof createMockClient>,
    event: string,
    ...args: any[]
): Promise<void> {
    const handlers = client.eventHandlers.get(event) || []
    for (const handler of handlers) {
        await handler(...args)
    }
}

function createMockChatInteraction(
    overrides?: Partial<ChatInputCommandInteraction>,
): ChatInputCommandInteraction {
    return {
        type: InteractionType.ApplicationCommand,
        isChatInputCommand: () => true,
        isButton: () => false,
        commandName: 'test',
        user: { id: 'user-1' },
        guild: { id: 'guild-1' },
        replied: false,
        deferred: false,
        options: {
            get: jest.fn(),
            getSubcommand: jest.fn(),
        },
        ...overrides,
    } as any
}

function createMockButtonInteraction(
    customId: string,
    overrides?: Partial<ButtonInteraction>,
): ButtonInteraction {
    return {
        type: InteractionType.MessageComponent,
        isChatInputCommand: () => false,
        isButton: () => true,
        customId,
        user: { id: 'user-1' },
        guild: { id: 'guild-1' },
        replied: false,
        deferred: false,
        ...overrides,
    } as any
}

describe('interactionHandler', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('handleInteractions', () => {
        it('should register interaction event listener', async () => {
            const client = createMockClient()

            await handleInteractions({ client })

            expect(client.on).toHaveBeenCalledWith(
                Events.InteractionCreate,
                expect.any(Function),
            )
            expect(debugLog).toHaveBeenCalledWith({
                message: 'Interaction handler set up successfully',
            })
        })

        it('should handle setup errors', async () => {
            const client = {
                on: jest.fn().mockImplementation(() => {
                    throw new Error('Setup error')
                }),
            } as any

            await handleInteractions({ client })

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error setting up interaction handler:',
                error: expect.any(Error),
            })
        })

        it('should catch async errors in interaction handler', async () => {
            const client = createMockClient()
            ;(executeCommand as jest.Mock).mockRejectedValue(
                new Error('Handler error'),
            )

            await handleInteractions({ client })

            const interaction = createMockChatInteraction()
            await triggerEvent(client, Events.InteractionCreate, interaction)

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error handling interaction:',
                error: expect.any(Error),
                data: expect.any(Object),
            })
        })
    })

    describe('handleInteraction', () => {
        it('should route chat input command to executeCommand', async () => {
            const interaction = createMockChatInteraction()
            const client = createMockClient()

            await handleInteraction(interaction, client)

            expect(monitorInteractionHandling).toHaveBeenCalledWith(
                InteractionType.ApplicationCommand.toString(),
                'user-1',
                'guild-1',
            )
            expect(executeCommand).toHaveBeenCalledWith({ interaction, client })
        })

        it('should route music button to handleMusicButtonInteraction', async () => {
            const interaction = createMockButtonInteraction('music_play')
            const client = createMockClient()

            await handleInteraction(interaction, client)

            expect(handleMusicButtonInteraction).toHaveBeenCalledWith(
                interaction,
            )
            expect(
                reactionRolesService.handleButtonInteraction,
            ).not.toHaveBeenCalled()
        })

        it('should route queue page button to handleMusicButtonInteraction', async () => {
            const interaction = createMockButtonInteraction('queue_page_2')
            const client = createMockClient()

            await handleInteraction(interaction, client)

            expect(handleMusicButtonInteraction).toHaveBeenCalledWith(
                interaction,
            )
        })

        it('should route non-music buttons to reactionRolesService', async () => {
            const interaction = createMockButtonInteraction('role_selector')
            const client = createMockClient()

            await handleInteraction(interaction, client)

            expect(
                reactionRolesService.handleButtonInteraction,
            ).toHaveBeenCalledWith(interaction)
            expect(handleMusicButtonInteraction).not.toHaveBeenCalled()
        })

        it('should handle interaction without guild', async () => {
            const interaction = createMockChatInteraction({ guild: null })
            const client = createMockClient()

            await handleInteraction(interaction, client)

            expect(monitorInteractionHandling).toHaveBeenCalledWith(
                expect.any(String),
                'user-1',
                undefined,
            )
            expect(executeCommand).toHaveBeenCalled()
        })

        it('should handle errors during command execution', async () => {
            ;(executeCommand as jest.Mock).mockRejectedValue(
                new Error('Command error'),
            )
            ;(createUserFriendlyError as jest.Mock).mockReturnValue(
                'An error occurred',
            )
            ;(errorEmbed as jest.Mock).mockReturnValue({ title: 'Error' })
            const interaction = createMockChatInteraction()
            const client = createMockClient()

            await handleInteraction(interaction, client)

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error handling interaction:',
                error: expect.any(Error),
                data: {
                    commandName: 'test',
                    userId: 'user-1',
                    guildId: 'guild-1',
                },
            })
            expect(createUserFriendlyError).toHaveBeenCalledWith(
                expect.any(Error),
            )
            expect(errorEmbed).toHaveBeenCalledWith(
                'Error',
                'An error occurred',
            )
            expect(interactionReply).toHaveBeenCalledWith({
                interaction,
                content: {
                    embeds: [{ title: 'Error' }],
                    ephemeral: true,
                },
            })
        })

        it('should handle errors during button interaction', async () => {
            ;(
                reactionRolesService.handleButtonInteraction as jest.Mock
            ).mockRejectedValue(new Error('Button error'))
            const interaction = createMockButtonInteraction('role_select')
            const client = createMockClient()

            await handleInteraction(interaction, client)

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error handling interaction:',
                error: expect.any(Error),
                data: {
                    commandName: 'role_select',
                    userId: 'user-1',
                    guildId: 'guild-1',
                },
            })
        })

        it('should not send error reply if interaction already replied', async () => {
            ;(executeCommand as jest.Mock).mockRejectedValue(new Error('Error'))
            const interaction = createMockChatInteraction({ replied: true })
            const client = createMockClient()

            await handleInteraction(interaction, client)

            expect(interactionReply).not.toHaveBeenCalled()
        })

        it('should not send error reply if interaction already deferred', async () => {
            ;(executeCommand as jest.Mock).mockRejectedValue(new Error('Error'))
            const interaction = createMockChatInteraction({ deferred: true })
            const client = createMockClient()

            await handleInteraction(interaction, client)

            expect(interactionReply).not.toHaveBeenCalled()
        })

        it('should not send error reply for button interactions', async () => {
            ;(
                reactionRolesService.handleButtonInteraction as jest.Mock
            ).mockRejectedValue(new Error('Error'))
            const interaction = createMockButtonInteraction('role_select')
            const client = createMockClient()

            await handleInteraction(interaction, client)

            expect(interactionReply).not.toHaveBeenCalled()
        })

        it('should handle error reply failures', async () => {
            ;(executeCommand as jest.Mock).mockRejectedValue(
                new Error('Command error'),
            )
            ;(interactionReply as jest.Mock).mockRejectedValue(
                new Error('Reply error'),
            )
            const interaction = createMockChatInteraction()
            const client = createMockClient()

            await handleInteraction(interaction, client)

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error handling interaction:',
                error: expect.any(Error),
                data: expect.any(Object),
            })
            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error sending error message:',
                error: expect.any(Error),
            })
        })

        it('should use unknown commandName for unhandled interaction types in error logs', async () => {
            ;(
                reactionRolesService.handleButtonInteraction as jest.Mock
            ).mockRejectedValue(new Error('Handler error'))
            const interaction = {
                type: 99,
                isChatInputCommand: () => false,
                isButton: () => true,
                customId: 'unknown_button',
                user: { id: 'user-1' },
                guild: { id: 'guild-1' },
            } as any
            const client = createMockClient()

            await handleInteraction(interaction, client)

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error handling interaction:',
                error: expect.any(Error),
                data: {
                    commandName: 'unknown_button',
                    userId: 'user-1',
                    guildId: 'guild-1',
                },
            })
        })
    })

    describe('interactionGetAllOptions', () => {
        it('should return interaction options', async () => {
            const mockOptions = {
                get: jest.fn(),
                getSubcommand: jest.fn(),
                getString: jest.fn(),
            }
            const interaction = createMockChatInteraction({
                options: mockOptions,
            })

            const result = await interactionGetAllOptions({ interaction })

            expect(result).toBe(mockOptions)
        })

        it('should handle errors getting options', async () => {
            const interaction = {
                get options() {
                    throw new Error('Options error')
                },
            } as any

            await expect(
                interactionGetAllOptions({ interaction }),
            ).rejects.toThrow()

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error getting interaction options:',
                error: expect.any(Error),
            })
        })
    })

    describe('interactionGetOption', () => {
        it('should get specific option by name', async () => {
            const mockOption = { name: 'test', value: 'value' }
            const interaction = createMockChatInteraction()
            ;(interaction.options.get as jest.Mock).mockReturnValue(mockOption)

            const result = await interactionGetOption({
                interaction,
                optionName: 'test',
            })

            expect(interaction.options.get).toHaveBeenCalledWith('test')
            expect(result).toBe(mockOption)
        })

        it('should return undefined for missing option', async () => {
            const interaction = createMockChatInteraction()
            ;(interaction.options.get as jest.Mock).mockReturnValue(undefined)

            const result = await interactionGetOption({
                interaction,
                optionName: 'missing',
            })

            expect(result).toBeUndefined()
        })

        it('should handle errors getting option', async () => {
            const interaction = createMockChatInteraction()
            ;(interaction.options.get as jest.Mock).mockImplementation(() => {
                throw new Error('Get error')
            })

            await expect(
                interactionGetOption({ interaction, optionName: 'test' }),
            ).rejects.toThrow('Get error')

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error getting interaction option:',
                error: expect.any(Error),
            })
        })
    })

    describe('interactionGetSubcommand', () => {
        it('should get subcommand name', async () => {
            const interaction = createMockChatInteraction()
            ;(interaction.options.getSubcommand as jest.Mock).mockReturnValue(
                'subcommand',
            )

            const result = await interactionGetSubcommand({ interaction })

            expect(interaction.options.getSubcommand).toHaveBeenCalled()
            expect(result).toBe('subcommand')
        })

        it('should handle errors getting subcommand', async () => {
            const interaction = createMockChatInteraction()
            ;(
                interaction.options.getSubcommand as jest.Mock
            ).mockImplementation(() => {
                throw new Error('No subcommand')
            })

            await expect(
                interactionGetSubcommand({ interaction }),
            ).rejects.toThrow('No subcommand')

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error getting interaction subcommand:',
                error: expect.any(Error),
            })
        })
    })
})
