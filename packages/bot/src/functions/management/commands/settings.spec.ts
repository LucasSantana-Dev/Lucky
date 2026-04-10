import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { ChatInputCommandInteraction } from 'discord.js'

const requireGuildMock = jest.fn()
const setGuildSettingsMock = jest.fn()
const interactionReplyMock = jest.fn()

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: (...args: unknown[]) => requireGuildMock(...args),
}))

jest.mock('@lucky/shared/services', () => ({
    guildSettingsService: {
        setGuildSettings: (...args: unknown[]) => setGuildSettingsMock(...args),
    },
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createErrorEmbed: jest.fn((title, desc) => ({ title, desc })),
    createSuccessEmbed: jest.fn((title, desc) => ({ title, desc })),
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
}))

describe('settings command', () => {
    let mockInteraction: Partial<ChatInputCommandInteraction>
    let settingsCommand: any

    beforeEach(async () => {
        jest.clearAllMocks()

        mockInteraction = {
            guildId: 'guild-123',
            deferReply: jest.fn().mockResolvedValue(undefined),
            options: {
                getSubcommandGroup: jest.fn().mockReturnValue('music'),
                getSubcommand: jest.fn().mockReturnValue('idle-timeout'),
                getInteger: jest.fn().mockReturnValue(5),
            },
        } as any

        requireGuildMock.mockResolvedValue(true)
        setGuildSettingsMock.mockResolvedValue(true)
        interactionReplyMock.mockResolvedValue(undefined)

        settingsCommand = (await import('./settings')).default
    })

    it('should defer reply with ephemeral', async () => {
        await settingsCommand.execute({ interaction: mockInteraction as ChatInputCommandInteraction })
        expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: true })
    })

    it('should save idle-timeout setting', async () => {
        await settingsCommand.execute({ interaction: mockInteraction as ChatInputCommandInteraction })
        expect(setGuildSettingsMock).toHaveBeenCalledWith('guild-123', { idleTimeoutMinutes: 5 })
    })

    it('should return early if requireGuild fails', async () => {
        requireGuildMock.mockResolvedValue(false)

        await settingsCommand.execute({ interaction: mockInteraction as ChatInputCommandInteraction })

        expect(mockInteraction.deferReply).not.toHaveBeenCalled()
    })

    it('should handle persist failure', async () => {
        setGuildSettingsMock.mockResolvedValue(false)

        await settingsCommand.execute({ interaction: mockInteraction as ChatInputCommandInteraction })

        expect(mockInteraction.deferReply).toHaveBeenCalled()
    })
})
