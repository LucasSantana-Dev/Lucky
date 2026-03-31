import { describe, test, expect, jest, beforeEach } from '@jest/globals'

jest.mock('@lucky/shared/services', () => ({
    reactionRolesService: {
        createReactionRoleMessage: jest.fn(),
        deleteReactionRoleMessage: jest.fn(),
        listReactionRoleMessages: jest.fn(),
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

import {
    handleCreate,
    handleDelete,
    handleList,
} from './reactionroleHandlers.js'
import { interactionReply } from '../../../utils/general/interactionReply.js'
import { reactionRolesService } from '@lucky/shared/services'

const interactionReplyMock = interactionReply as jest.MockedFunction<
    typeof interactionReply
>
const createReactionRoleMessageMock =
    reactionRolesService.createReactionRoleMessage as jest.MockedFunction<any>
const deleteReactionRoleMessageMock =
    reactionRolesService.deleteReactionRoleMessage as jest.MockedFunction<any>
const listReactionRoleMessagesMock =
    reactionRolesService.listReactionRoleMessages as jest.MockedFunction<any>

function createChannel(id = 'channel-123', isText = true) {
    return {
        id,
        name: 'test-channel',
        isTextBased: () => isText,
    }
}

function createGuild(id = 'guild-123') {
    return { id }
}

function createInteraction({
    channel = null as any,
    title = 'Test Embed',
    description = 'Test Description',
    roles = 'role1:Label1:emoji1:Primary',
    messageId = 'msg-123',
} = {}) {
    return {
        guild: createGuild(),
        options: {
            getChannel: jest.fn(() => channel),
            getString: jest.fn((name: string) => {
                if (name === 'title') return title
                if (name === 'description') return description
                if (name === 'roles') return roles
                if (name === 'message_id') return messageId
                return null
            }),
        },
    } as any
}

describe('reactionroleHandlers', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('handleCreate', () => {
        test('creates reaction role message with valid data', async () => {
            const channel = createChannel()
            const guild = createGuild()
            const interaction = createInteraction({
                channel,
                title: 'Role Selection',
                description: 'Pick your roles',
                roles: 'role1:Label1:emoji1:Primary,role2:Label2:emoji2:Secondary',
            })

            createReactionRoleMessageMock.mockResolvedValueOnce({
                id: 'msg-456',
            })

            await handleCreate(interaction, guild)

            expect(createReactionRoleMessageMock).toHaveBeenCalled()
        })

        test('rejects non-text channel', async () => {
            const channel = createChannel('channel-123', false)
            const guild = createGuild()
            const interaction = createInteraction({ channel })

            await handleCreate(interaction, guild)

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
            expect(createReactionRoleMessageMock).not.toHaveBeenCalled()
        })

        test('throws error for invalid role format', async () => {
            const channel = createChannel()
            const guild = createGuild()
            const interaction = createInteraction({
                channel,
                roles: 'invalid-format-no-colon',
            })

            await expect(async () => {
                await handleCreate(interaction, guild)
            }).rejects.toThrow()
        })

        test('sends success embed when message created', async () => {
            const channel = createChannel()
            const guild = createGuild()
            const interaction = createInteraction({ channel })

            createReactionRoleMessageMock.mockResolvedValueOnce({
                id: 'msg-789',
            })

            await handleCreate(interaction, guild)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    embeds: [
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: 'Success',
                            }),
                        }),
                    ],
                    ephemeral: true,
                },
            })
        })

        test('uses multiple roles in creation', async () => {
            const channel = createChannel()
            const guild = createGuild()
            const interaction = createInteraction({
                channel,
                roles: 'role1:Dev:👨‍💻:Primary,role2:Mod:🔨:Danger',
            })

            createReactionRoleMessageMock.mockResolvedValueOnce({})

            await handleCreate(interaction, guild)

            const call = createReactionRoleMessageMock.mock.calls[0][0]
            expect(call.roles.length).toBe(2)
        })
    })

    describe('handleDelete', () => {
        test('deletes reaction role message and sends success', async () => {
            const guild = createGuild()
            const interaction = createInteraction()

            deleteReactionRoleMessageMock.mockResolvedValueOnce(true)

            await handleDelete(interaction, guild)

            expect(deleteReactionRoleMessageMock).toHaveBeenCalledWith(
                'msg-123',
                'guild-123',
            )
            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    embeds: [
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: 'Success',
                            }),
                        }),
                    ],
                    ephemeral: true,
                },
            })
        })

        test('sends error when message not found', async () => {
            const guild = createGuild()
            const interaction = createInteraction()

            deleteReactionRoleMessageMock.mockResolvedValueOnce(false)

            await handleDelete(interaction, guild)

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

        test('uses correct message and guild ids for deletion', async () => {
            const guild = createGuild('guild-xyz')
            const interaction = createInteraction({ messageId: 'msg-xyz' })

            deleteReactionRoleMessageMock.mockResolvedValueOnce(true)

            await handleDelete(interaction, guild)

            expect(deleteReactionRoleMessageMock).toHaveBeenCalledWith(
                'msg-xyz',
                'guild-xyz',
            )
        })
    })

    describe('handleList', () => {
        test('lists all reaction role messages', async () => {
            const guild = createGuild()
            const interaction = createInteraction()

            listReactionRoleMessagesMock.mockResolvedValueOnce([
                {
                    messageId: 'msg1',
                    channelId: 'channel1',
                    mappings: [{}, {}],
                },
                {
                    messageId: 'msg2',
                    channelId: 'channel2',
                    mappings: [{}],
                },
            ])

            await handleList(interaction, guild)

            expect(listReactionRoleMessagesMock).toHaveBeenCalledWith(
                'guild-123',
            )
            expect(interactionReplyMock).toHaveBeenCalled()
        })

        test('displays multiple messages with counts', async () => {
            const guild = createGuild()
            const interaction = createInteraction()

            listReactionRoleMessagesMock.mockResolvedValueOnce([
                {
                    messageId: 'msg1',
                    channelId: 'ch1',
                    mappings: [{}, {}],
                },
                {
                    messageId: 'msg2',
                    channelId: 'ch2',
                    mappings: [{}, {}, {}],
                },
            ])

            await handleList(interaction, guild)

            const call = interactionReplyMock.mock.calls[0][0]
            const embed = call.content.embeds[0]
            const desc = embed.data.description

            expect(desc).toContain('Roles: 2')
            expect(desc).toContain('Roles: 3')
        })

        test('sends error when no messages found', async () => {
            const guild = createGuild()
            const interaction = createInteraction()

            listReactionRoleMessagesMock.mockResolvedValueOnce([])

            await handleList(interaction, guild)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    embeds: [
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: 'No Messages',
                            }),
                        }),
                    ],
                    ephemeral: true,
                },
            })
        })

        test('uses correct guild id for listing', async () => {
            const guild = createGuild('guild-xyz')
            const interaction = createInteraction()
            interaction.guild = guild

            listReactionRoleMessagesMock.mockResolvedValueOnce([])

            await handleList(interaction, guild)

            expect(listReactionRoleMessagesMock).toHaveBeenCalledWith(
                'guild-xyz',
            )
        })
    })
})
