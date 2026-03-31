import { describe, test, expect, jest, beforeEach } from '@jest/globals'

jest.mock('@lucky/shared/services', () => ({
    featureToggleService: {
        isEnabled: jest.fn(),
    },
}))

jest.mock('../../../utils/general/interactionReply.js', () => ({
    interactionReply: jest.fn(),
}))

jest.mock('../../../utils/general/embeds.js', () => ({
    errorEmbed: (title: string, desc: string) => ({
        data: { title, description: desc },
    }),
    successEmbed: (title: string, desc: string) => ({
        data: { title, description: desc },
    }),
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
}))

jest.mock('../../../utils/command/commandValidations.js', () => ({
    requireGuild: jest.fn(),
}))

jest.mock('../handlers/twitchHandlers.js', () => ({
    handleTwitchAdd: jest.fn(),
    handleTwitchRemove: jest.fn(),
    handleTwitchList: jest.fn(),
}))

import twitchCommand from './twitch.js'
import { featureToggleService } from '@lucky/shared/services'
import { interactionReply } from '../../../utils/general/interactionReply.js'
import { requireGuild } from '../../../utils/command/commandValidations.js'
import {
    handleTwitchAdd,
    handleTwitchRemove,
    handleTwitchList,
} from '../handlers/twitchHandlers.js'
import { errorLog } from '@lucky/shared/utils'

const featureToggleMock =
    featureToggleService.isEnabled as jest.MockedFunction<any>
const interactionReplyMock = interactionReply as jest.MockedFunction<any>
const requireGuildMock = requireGuild as jest.MockedFunction<any>
const handleAddMock = handleTwitchAdd as jest.MockedFunction<any>
const handleRemoveMock = handleTwitchRemove as jest.MockedFunction<any>
const handleListMock = handleTwitchList as jest.MockedFunction<any>
const errorLogMock = errorLog as jest.MockedFunction<any>

function createGuild(id = 'guild-123', ownerId = 'owner-123') {
    return { id, ownerId, name: 'Test Guild' }
}

function createUser(id = 'user-123') {
    return { id }
}

function createInteraction({
    guildId = 'guild-123',
    userId = 'user-123',
    subcommand = 'add',
} = {}) {
    const guild = createGuild(guildId)
    const user = createUser(userId)

    const interaction = {
        guild,
        guildId,
        user,
        options: {
            getSubcommand: jest.fn(() => subcommand),
        },
    }
    return interaction as any
}

describe('twitch command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('command structure', () => {
        test('command has name "twitch"', () => {
            expect(twitchCommand.data.name).toBe('twitch')
        })

        test('command has description', () => {
            expect(twitchCommand.data.description).toBeDefined()
            expect(twitchCommand.data.description).toContain('Twitch')
        })

        test('command requires ManageGuild permission', () => {
            const permissions = twitchCommand.data.default_member_permissions
            expect(permissions).toBeDefined()
        })

        test('command is registered', () => {
            expect(twitchCommand).toBeDefined()
            expect(twitchCommand.category).toBe('general')
        })

        test('has execute function', () => {
            expect(twitchCommand.execute).toBeDefined()
            expect(typeof twitchCommand.execute).toBe('function')
        })
    })

    describe('execution', () => {
        test('rejects when guild validation fails', async () => {
            const interaction = createInteraction()
            requireGuildMock.mockResolvedValueOnce(false)

            await twitchCommand.execute({ interaction })

            expect(requireGuildMock).toHaveBeenCalledWith(interaction)
            expect(handleAddMock).not.toHaveBeenCalled()
        })

        test('rejects when interaction.guild is null', async () => {
            const interaction = createInteraction()
            interaction.guild = null
            requireGuildMock.mockResolvedValueOnce(true)

            await twitchCommand.execute({ interaction })

            expect(handleAddMock).not.toHaveBeenCalled()
        })

        test('rejects when feature is disabled', async () => {
            const interaction = createInteraction()
            requireGuildMock.mockResolvedValueOnce(true)
            featureToggleMock.mockResolvedValueOnce(false)

            await twitchCommand.execute({ interaction })

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: 'Twitch notifications are currently disabled.',
                    ephemeral: true,
                },
            })
        })

        test('routes "add" subcommand to handleTwitchAdd', async () => {
            const interaction = createInteraction({ subcommand: 'add' })
            requireGuildMock.mockResolvedValueOnce(true)
            featureToggleMock.mockResolvedValueOnce(true)
            handleAddMock.mockResolvedValueOnce(undefined)

            await twitchCommand.execute({ interaction })

            expect(handleAddMock).toHaveBeenCalledWith(interaction)
            expect(handleRemoveMock).not.toHaveBeenCalled()
            expect(handleListMock).not.toHaveBeenCalled()
        })

        test('routes "remove" subcommand to handleTwitchRemove', async () => {
            const interaction = createInteraction({ subcommand: 'remove' })
            requireGuildMock.mockResolvedValueOnce(true)
            featureToggleMock.mockResolvedValueOnce(true)
            handleRemoveMock.mockResolvedValueOnce(undefined)

            await twitchCommand.execute({ interaction })

            expect(handleRemoveMock).toHaveBeenCalledWith(interaction)
            expect(handleAddMock).not.toHaveBeenCalled()
            expect(handleListMock).not.toHaveBeenCalled()
        })

        test('routes "list" subcommand to handleTwitchList', async () => {
            const interaction = createInteraction({ subcommand: 'list' })
            requireGuildMock.mockResolvedValueOnce(true)
            featureToggleMock.mockResolvedValueOnce(true)
            handleListMock.mockResolvedValueOnce(undefined)

            await twitchCommand.execute({ interaction })

            expect(handleListMock).toHaveBeenCalledWith(interaction)
            expect(handleAddMock).not.toHaveBeenCalled()
            expect(handleRemoveMock).not.toHaveBeenCalled()
        })

        test('passes correct guild and user to feature toggle', async () => {
            const interaction = createInteraction({
                guildId: 'guild-xyz',
                userId: 'user-abc',
            })
            requireGuildMock.mockResolvedValueOnce(true)
            featureToggleMock.mockResolvedValueOnce(true)
            handleAddMock.mockResolvedValueOnce(undefined)

            await twitchCommand.execute({ interaction })

            expect(featureToggleMock).toHaveBeenCalledWith(
                'TWITCH_NOTIFICATIONS',
                {
                    guildId: 'guild-xyz',
                    userId: 'user-abc',
                },
            )
        })

        test('catches handler errors and sends error embed', async () => {
            const interaction = createInteraction({ subcommand: 'add' })
            requireGuildMock.mockResolvedValueOnce(true)
            featureToggleMock.mockResolvedValueOnce(true)
            const testError = new Error('handler error')
            handleAddMock.mockRejectedValueOnce(testError)

            await twitchCommand.execute({ interaction })

            expect(errorLogMock).toHaveBeenCalledWith({
                message: 'Twitch command error',
                error: testError,
            })
            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    embeds: [
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: 'Error',
                            }),
                        }),
                    ],
                    ephemeral: true,
                },
            })
        })

        test('catches remove handler errors', async () => {
            const interaction = createInteraction({ subcommand: 'remove' })
            requireGuildMock.mockResolvedValueOnce(true)
            featureToggleMock.mockResolvedValueOnce(true)
            const testError = new Error('remove error')
            handleRemoveMock.mockRejectedValueOnce(testError)

            await twitchCommand.execute({ interaction })

            expect(errorLogMock).toHaveBeenCalled()
            expect(interactionReplyMock).toHaveBeenCalled()
        })

        test('catches list handler errors', async () => {
            const interaction = createInteraction({ subcommand: 'list' })
            requireGuildMock.mockResolvedValueOnce(true)
            featureToggleMock.mockResolvedValueOnce(true)
            const testError = new Error('list error')
            handleListMock.mockRejectedValueOnce(testError)

            await twitchCommand.execute({ interaction })

            expect(errorLogMock).toHaveBeenCalled()
            expect(interactionReplyMock).toHaveBeenCalled()
        })
    })
})
