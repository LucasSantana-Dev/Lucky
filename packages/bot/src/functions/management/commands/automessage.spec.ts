import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import type { ChatInputCommandInteraction } from 'discord.js'
import automessageCommand from './automessage.js'

const handleAutoMessageConfigMock = jest.fn()
const handleAutoMessageListMock = jest.fn()
const errorLogMock = jest.fn()
const interactionReplyMock = jest.fn()

jest.mock('../handlers/automessageHandlers.js', () => ({
    handleAutoMessageConfig: (...args: unknown[]) =>
        handleAutoMessageConfigMock(...args),
    handleAutoMessageList: (...args: unknown[]) =>
        handleAutoMessageListMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('../../../utils/general/interactionReply.js', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

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
        handleAutoMessageConfigMock.mockResolvedValue(undefined)
        handleAutoMessageListMock.mockResolvedValue(undefined)
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
        expect(handleAutoMessageConfigMock).not.toHaveBeenCalled()
        expect(handleAutoMessageListMock).not.toHaveBeenCalled()
    })

    it('routes welcome subcommand to config handler with correct type', async () => {
        const interaction = createInteraction('welcome')

        await automessageCommand.execute({ interaction })

        expect(handleAutoMessageConfigMock).toHaveBeenCalledWith(
            interaction,
            'welcome',
        )
        expect(handleAutoMessageListMock).not.toHaveBeenCalled()
    })

    it('routes leave subcommand to config handler with correct type', async () => {
        const interaction = createInteraction('leave')

        await automessageCommand.execute({ interaction })

        expect(handleAutoMessageConfigMock).toHaveBeenCalledWith(
            interaction,
            'leave',
        )
        expect(handleAutoMessageListMock).not.toHaveBeenCalled()
    })

    it('routes list subcommand to list handler', async () => {
        const interaction = createInteraction('list')

        await automessageCommand.execute({ interaction })

        expect(handleAutoMessageListMock).toHaveBeenCalledWith(interaction)
        expect(handleAutoMessageConfigMock).not.toHaveBeenCalled()
    })

    it('logs error and replies with failure message when config handler throws', async () => {
        const interaction = createInteraction('welcome')
        const error = new Error('Database connection failed')
        handleAutoMessageConfigMock.mockRejectedValue(error)

        await automessageCommand.execute({ interaction })

        expect(errorLogMock).toHaveBeenCalledWith({
            message: 'Failed to manage auto-message',
            error,
        })
        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                content: '❌ Failed to manage auto-message. Please try again.',
            },
        })
    })

    it('logs error and replies with failure message when list handler throws', async () => {
        const interaction = createInteraction('list')
        const error = new Error('Redis timeout')
        handleAutoMessageListMock.mockRejectedValue(error)

        await automessageCommand.execute({ interaction })

        expect(errorLogMock).toHaveBeenCalledWith({
            message: 'Failed to manage auto-message',
            error,
        })
        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                content: '❌ Failed to manage auto-message. Please try again.',
            },
        })
    })

    it('handles unknown errors gracefully', async () => {
        const interaction = createInteraction('welcome')
        handleAutoMessageConfigMock.mockRejectedValue('Unknown error type')

        await automessageCommand.execute({ interaction })

        expect(errorLogMock).toHaveBeenCalledWith({
            message: 'Failed to manage auto-message',
            error: 'Unknown error type',
        })
        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                content: '❌ Failed to manage auto-message. Please try again.',
            },
        })
    })
})
