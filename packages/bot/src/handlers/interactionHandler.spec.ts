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
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    captureException: jest.fn(),
}))

jest.mock('@lucky/shared/utils/support', () => ({
    mintCorrelationId: jest.fn(() => 'DEFAULT123'),
    tagCorrelationIdToSentry: jest.fn(),
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

jest.mock('../utils/general/errorReportEmbed', () => ({
    buildCommandErrorEmbed: jest.fn(),
}))

jest.mock('../utils/general/interactionReply', () => ({
    interactionReply: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../utils/monitoring', () => ({
    monitorInteractionHandling: jest.fn(),
}))

import { errorLog, captureException } from '@lucky/shared/utils'
import { executeCommand } from './commandsHandler'
import { handleMusicButtonInteraction } from './musicButtonHandler'
import { reactionRolesService } from '@lucky/shared/services'
import { buildCommandErrorEmbed } from '../utils/general/errorReportEmbed'
import { interactionReply } from '../utils/general/interactionReply'
import { monitorInteractionHandling } from '../utils/monitoring'
import { mintCorrelationId } from '@lucky/shared/utils/support'

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
        // bot jest runs with resetMocks:true, so (re)set return values here.
        // buildCommandErrorEmbed now returns the embed directly; the handler
        // owns the correlation id (mintCorrelationId → 'DEFAULT123').
        ;(mintCorrelationId as jest.Mock).mockReturnValue('DEFAULT123')
        ;(buildCommandErrorEmbed as jest.Mock).mockReturnValue({
            title: 'Error',
        })
    })

    describe('handleInteractions', () => {})

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
            const mockEmbed = { title: 'Error', setFooter: jest.fn() }
            ;(buildCommandErrorEmbed as jest.Mock).mockReturnValue(mockEmbed)
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
                    correlationId: 'DEFAULT123',
                },
            })
            expect(buildCommandErrorEmbed).toHaveBeenCalledWith(
                expect.any(Error),
                'DEFAULT123',
                {
                    guildId: 'guild-1',
                    command: 'test',
                },
            )
            expect(interactionReply).toHaveBeenCalledWith({
                interaction,
                content: {
                    embeds: [mockEmbed],
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
                    correlationId: 'DEFAULT123',
                },
            })
            expect(captureException).toHaveBeenCalledWith(
                expect.any(Error),
                expect.objectContaining({
                    context: 'interaction-handling-failure',
                    commandName: 'role_select',
                    guildId: 'guild-1',
                    correlationId: 'DEFAULT123',
                }),
            )
        })

        it('wraps a non-Error rejection before capturing it', async () => {
            ;(executeCommand as jest.Mock).mockRejectedValue('boom')
            const interaction = createMockChatInteraction()
            const client = createMockClient()

            await handleInteraction(interaction, client)

            expect(captureException).toHaveBeenCalledWith(
                expect.any(Error),
                expect.objectContaining({
                    context: 'interaction-handling-failure',
                }),
            )
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
            const mockEmbed = { title: 'Error' }
            ;(buildCommandErrorEmbed as jest.Mock).mockReturnValue(mockEmbed)
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
                    correlationId: 'DEFAULT123',
                },
            })
        })

        it('should include correlationId in captureException for chat input command errors', async () => {
            ;(executeCommand as jest.Mock).mockRejectedValue(
                new Error('Command error'),
            )
            const interaction = createMockChatInteraction()
            const client = createMockClient()

            await handleInteraction(interaction, client)

            expect(captureException).toHaveBeenCalledWith(
                expect.any(Error),
                expect.objectContaining({
                    context: 'interaction-handling-failure',
                    correlationId: 'DEFAULT123',
                }),
            )
        })

        it('includes correlationId in captureException for non-chat-input errors too (minted unconditionally)', async () => {
            ;(
                reactionRolesService.handleButtonInteraction as jest.Mock
            ).mockRejectedValue(new Error('Button error'))
            const interaction = createMockButtonInteraction('role_select')
            const client = createMockClient()

            await handleInteraction(interaction, client)

            expect(captureException).toHaveBeenCalledWith(
                expect.any(Error),
                expect.objectContaining({
                    correlationId: 'DEFAULT123',
                }),
            )
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
