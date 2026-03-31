import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals'
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js'
import type { ChatInputCommandInteraction, Guild, User } from 'discord.js'

const interactionReplyMock = jest.fn()
const requireGuildMock = jest.fn()
const errorEmbedMock = jest.fn()
const errorLogMock = jest.fn()
const featureToggleServiceMock = jest.fn()
const handleTwitchAddMock = jest.fn()
const handleTwitchRemoveMock = jest.fn()
const handleTwitchListMock = jest.fn()

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: interactionReplyMock,
}))

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: requireGuildMock,
}))

jest.mock('../../../utils/general/embeds', () => ({
    errorEmbed: errorEmbedMock,
    successEmbed: jest.fn(),
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: errorLogMock,
    infoLog: jest.fn(),
}))

jest.mock('@lucky/shared/services', () => ({
    featureToggleService: {
        isEnabled: featureToggleServiceMock,
    },
}))

jest.mock('../handlers/twitchHandlers', () => ({
    handleTwitchAdd: handleTwitchAddMock,
    handleTwitchRemove: handleTwitchRemoveMock,
    handleTwitchList: handleTwitchListMock,
}))

import Command from '../../../models/Command'
import twitchCommand from './twitch'

describe('twitch command', () => {
    let mockInteraction: Partial<ChatInputCommandInteraction>
    let mockGuild: Partial<Guild>
    let mockUser: Partial<User>
    let mockGetSubcommand: jest.Mock

    beforeEach(() => {
        jest.clearAllMocks()

        mockUser = {
            id: 'user123',
        }

        mockGuild = {
            id: 'guild123',
            name: 'Test Guild',
            ownerId: 'owner123',
        }

        mockGetSubcommand = jest.fn()

        mockInteraction = {
            guild: mockGuild as Guild,
            user: mockUser as User,
            options: {
                getSubcommand: mockGetSubcommand,
                getString: jest.fn(),
                getChannel: jest.fn(),
            },
        }

        requireGuildMock.mockResolvedValue(true)
        featureToggleServiceMock.mockResolvedValue(true)
        errorEmbedMock.mockReturnValue({} as any)
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('should have correct command structure', () => {
        expect(twitchCommand).toHaveProperty('data')
        expect(twitchCommand).toHaveProperty('category', 'general')
        expect(twitchCommand).toHaveProperty('execute')
        expect(twitchCommand.data).toBeInstanceOf(SlashCommandBuilder)
    })

    it('should have correct command name and description', () => {
        const builder = twitchCommand.data as SlashCommandBuilder
        expect(builder.name).toBe('twitch')
        expect(builder.description).toBe(
            'Manage Twitch stream-online notifications',
        )
    })

    it('should require ManageGuild permission', () => {
        const builder = twitchCommand.data as SlashCommandBuilder
        expect(builder.default_member_permissions).toBe(
            PermissionFlagsBits.ManageGuild.toString(),
        )
    })

    it('should return early if requireGuild validation fails', async () => {
        requireGuildMock.mockResolvedValue(false)

        await twitchCommand.execute({
            interaction: mockInteraction as ChatInputCommandInteraction,
        })

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('should return early if guild is missing', async () => {
        mockInteraction.guild = null

        await twitchCommand.execute({
            interaction: mockInteraction as ChatInputCommandInteraction,
        })

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('should reply with disabled message when feature is disabled', async () => {
        featureToggleServiceMock.mockResolvedValue(false)

        await twitchCommand.execute({
            interaction: mockInteraction as ChatInputCommandInteraction,
        })

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction: mockInteraction,
            content: {
                content: 'Twitch notifications are currently disabled.',
                ephemeral: true,
            },
        })
    })

    it('should call handleTwitchAdd for add subcommand', async () => {
        mockGetSubcommand.mockReturnValue('add')
        handleTwitchAddMock.mockResolvedValue(undefined)

        await twitchCommand.execute({
            interaction: mockInteraction as ChatInputCommandInteraction,
        })

        expect(handleTwitchAddMock).toHaveBeenCalledWith(mockInteraction)
    })

    it('should call handleTwitchRemove for remove subcommand', async () => {
        mockGetSubcommand.mockReturnValue('remove')
        handleTwitchRemoveMock.mockResolvedValue(undefined)

        await twitchCommand.execute({
            interaction: mockInteraction as ChatInputCommandInteraction,
        })

        expect(handleTwitchRemoveMock).toHaveBeenCalledWith(mockInteraction)
    })

    it('should call handleTwitchList for list subcommand', async () => {
        mockGetSubcommand.mockReturnValue('list')
        handleTwitchListMock.mockResolvedValue(undefined)

        await twitchCommand.execute({
            interaction: mockInteraction as ChatInputCommandInteraction,
        })

        expect(handleTwitchListMock).toHaveBeenCalledWith(mockInteraction)
    })

    it('should handle errors and reply with error embed', async () => {
        mockGetSubcommand.mockReturnValue('add')
        handleTwitchAddMock.mockRejectedValue(new Error('API error'))

        await twitchCommand.execute({
            interaction: mockInteraction as ChatInputCommandInteraction,
        })

        expect(errorLogMock).toHaveBeenCalledWith({
            message: 'Twitch command error',
            error: expect.any(Error),
        })
        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction: mockInteraction,
            content: {
                embeds: [expect.anything()],
                ephemeral: true,
            },
        })
    })

    it('should check feature toggle with correct guild and user context', async () => {
        mockGetSubcommand.mockReturnValue('list')
        handleTwitchListMock.mockResolvedValue(undefined)

        await twitchCommand.execute({
            interaction: mockInteraction as ChatInputCommandInteraction,
        })

        expect(featureToggleServiceMock).toHaveBeenCalledWith(
            'TWITCH_NOTIFICATIONS',
            {
                guildId: 'guild123',
                userId: 'user123',
            },
        )
    })

    it('should handle unknown subcommand gracefully', async () => {
        mockGetSubcommand.mockReturnValue('unknown')

        await twitchCommand.execute({
            interaction: mockInteraction as ChatInputCommandInteraction,
        })

        // Should not call any handler for unknown subcommand
        expect(handleTwitchAddMock).not.toHaveBeenCalled()
        expect(handleTwitchRemoveMock).not.toHaveBeenCalled()
        expect(handleTwitchListMock).not.toHaveBeenCalled()
    })
})
