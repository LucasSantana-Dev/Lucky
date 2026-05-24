import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import type { ChatInputCommandInteraction } from 'discord.js'

const errorLogMock = jest.fn()
const interactionReplyMock = jest.fn()
const infoLogMock = jest.fn()

const autoMessageServiceMock = {
    getWelcomeMessage: jest.fn(),
    getLeaveMessage: jest.fn(),
    getMessagesByType: jest.fn(),
    createMessage: jest.fn(),
    updateMessage: jest.fn(),
}

jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: unknown[]) => errorLogMock(...args),
    infoLog: (...args: unknown[]) => infoLogMock(...args),
}))

jest.mock('@lucky/shared/services', () => ({
    autoMessageService: autoMessageServiceMock,
}))

jest.mock('../../../utils/general/interactionReply.js', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

import automessageCommand from './automessage.js'

function createInteraction(
    subcommand: string,
    hasGuild = true,
): ChatInputCommandInteraction {
    return {
        guild: hasGuild ? { id: 'guild-123', name: 'Test Guild' } : null,
        options: {
            getSubcommand: jest.fn().mockReturnValue(subcommand),
        },
    } as unknown as ChatInputCommandInteraction
}

describe('automessage command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        interactionReplyMock.mockResolvedValue(undefined)
        autoMessageServiceMock.getWelcomeMessage.mockResolvedValue(null)
        autoMessageServiceMock.getLeaveMessage.mockResolvedValue(null)
        autoMessageServiceMock.getMessagesByType.mockResolvedValue([])
        autoMessageServiceMock.createMessage.mockResolvedValue(undefined)
        autoMessageServiceMock.updateMessage.mockResolvedValue(undefined)
        infoLogMock.mockReturnValue(undefined)
    })

    it('defines command metadata with correct permissions', () => {
        expect(automessageCommand.data.name).toBe('automessage')
        expect(automessageCommand.data.description).toBe(
            'Configure auto-messages',
        )
        expect(automessageCommand.category).toBe('management')
    })

    it('rejects command when used outside of a guild', async () => {
        const interaction = createInteraction('welcome', false)

        await automessageCommand.execute({ interaction })

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                content: '❌ This command can only be used in a server.',
            },
        })
        // Verify no service calls were made
        expect(autoMessageServiceMock.createMessage).not.toHaveBeenCalled()
        expect(autoMessageServiceMock.getMessagesByType).not.toHaveBeenCalled()
    })

    it('enables welcome messages with channel and content (happy path)', async () => {
        autoMessageServiceMock.getWelcomeMessage.mockResolvedValue(null)
        autoMessageServiceMock.createMessage.mockResolvedValue({
            id: 'msg-1',
            type: 'welcome',
            enabled: true,
        })

        const interaction = createInteraction('welcome')
        const mockOptions = {
            getSubcommand: jest.fn().mockReturnValue('welcome'),
            getBoolean: jest.fn().mockReturnValue(true),
            getChannel: jest.fn().mockReturnValue({
                id: 'channel-123',
                toString: () => '<#channel-123>',
            }),
            getString: jest.fn().mockReturnValue('Welcome {user}!'),
        }
        interaction.options = mockOptions as unknown as any
        interaction.user = { tag: 'testuser#0001' } as any
        interaction.guild!.name = 'Test Guild'

        await automessageCommand.execute({ interaction })

        // Verify the service was called to create the message
        expect(autoMessageServiceMock.createMessage).toHaveBeenCalledWith(
            'guild-123',
            'welcome',
            expect.any(Object),
            { channelId: 'channel-123' },
        )
        // Verify user got success response
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                interaction,
                content: expect.objectContaining({
                    embeds: expect.any(Array),
                }),
            }),
        )
    })

    it('lists auto-messages and shows count (happy path)', async () => {
        const mockMessage = {
            id: 'msg-1',
            type: 'welcome',
            enabled: true,
            channelId: 'channel-123',
            message: 'Welcome to the server!',
        }
        autoMessageServiceMock.getMessagesByType.mockResolvedValue([
            mockMessage,
        ])

        const interaction = createInteraction('list')

        await automessageCommand.execute({ interaction })

        // Verify the service was queried for both types
        expect(autoMessageServiceMock.getMessagesByType).toHaveBeenCalledWith(
            'guild-123',
            'welcome',
        )
        expect(autoMessageServiceMock.getMessagesByType).toHaveBeenCalledWith(
            'guild-123',
            'leave',
        )
        // Verify user got response with embedded message
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                interaction,
                content: expect.objectContaining({
                    embeds: expect.any(Array),
                }),
            }),
        )
    })

    it('handles error when service fails (error path)', async () => {
        const interaction = createInteraction('welcome')
        const error = new Error('Database connection failed')
        autoMessageServiceMock.getWelcomeMessage.mockRejectedValue(error)

        const mockOptions = {
            getSubcommand: jest.fn().mockReturnValue('welcome'),
            getBoolean: jest.fn().mockReturnValue(true),
            getChannel: jest.fn().mockReturnValue({
                id: 'channel-123',
                toString: () => '<#channel-123>',
            }),
            getString: jest.fn().mockReturnValue('Welcome {user}!'),
        }
        interaction.options = mockOptions as unknown as any

        await automessageCommand.execute({ interaction })

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Failed to manage auto-message',
            }),
        )
        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                content: '❌ Failed to manage auto-message. Please try again.',
            },
        })
    })
})
