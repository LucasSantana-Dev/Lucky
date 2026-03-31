import { describe, test, expect, jest, beforeEach } from '@jest/globals'

jest.mock('@lucky/shared/services', () => ({
    twitchNotificationService: {
        add: jest.fn(),
        remove: jest.fn(),
        listByGuild: jest.fn(),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    getPrismaClient: jest.fn(),
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

jest.mock('../../../twitch/twitchApi.js', () => ({
    getTwitchUserByLogin: jest.fn(),
}))

jest.mock('../../../twitch/index.js', () => ({
    refreshTwitchSubscriptions: jest.fn(),
}))

import {
    handleTwitchAdd,
    handleTwitchRemove,
    handleTwitchList,
} from './twitchHandlers.js'
import { twitchNotificationService } from '@lucky/shared/services'
import { getPrismaClient } from '@lucky/shared/utils'
import { interactionReply } from '../../../utils/general/interactionReply.js'
import { getTwitchUserByLogin } from '../../../twitch/twitchApi.js'
import { refreshTwitchSubscriptions } from '../../../twitch/index.js'

const twitchServiceAddMock =
    twitchNotificationService.add as jest.MockedFunction<any>
const twitchServiceRemoveMock =
    twitchNotificationService.remove as jest.MockedFunction<any>
const twitchServiceListMock =
    twitchNotificationService.listByGuild as jest.MockedFunction<any>
const getPrismaMock = getPrismaClient as jest.MockedFunction<any>
const interactionReplyMock = interactionReply as jest.MockedFunction<any>
const getTwitchUserMock = getTwitchUserByLogin as jest.MockedFunction<any>
const refreshSubscriptionsMock =
    refreshTwitchSubscriptions as jest.MockedFunction<any>

function createGuild(id = '1', discordId = 'guild-123') {
    return { id, discordId, name: 'Test Guild', ownerId: 'owner-123' }
}

function createTwitchUser(
    id = 'twitch-123',
    login = 'testuser',
    display_name = 'TestUser',
) {
    return { id, login, display_name }
}

function createChannel(id = 'channel-123') {
    return {
        id,
        isTextBased: () => true,
    }
}

function createInteraction({
    guildId = 'guild-123',
    username = 'testuser',
    channel = null as any,
} = {}) {
    const guild = { id: guildId, ownerId: 'owner-123', name: 'Test Guild' }

    const interaction = {
        guild,
        guildId,
        channel: channel || createChannel(),
        options: {
            getString: jest.fn((name: string) => {
                if (name === 'username') return username
                return null
            }),
            getChannel: jest.fn((name: string) => {
                if (name === 'channel') return channel
                return null
            }),
        },
    }
    return interaction as any
}

describe('twitchHandlers', () => {
    let mockPrisma: any

    beforeEach(() => {
        jest.clearAllMocks()
        mockPrisma = {
            guild: {
                findUnique: jest.fn(),
                create: jest.fn(),
            },
        }
        getPrismaMock.mockReturnValue(mockPrisma)
    })

    describe('handleTwitchAdd', () => {
        test('adds notification successfully', async () => {
            const twitchUser = createTwitchUser()
            const guild = createGuild()
            const interaction = createInteraction()

            getTwitchUserMock.mockResolvedValueOnce(twitchUser)
            mockPrisma.guild.findUnique.mockResolvedValueOnce(guild)
            twitchServiceAddMock.mockResolvedValueOnce(true)
            refreshSubscriptionsMock.mockResolvedValueOnce(undefined)

            await handleTwitchAdd(interaction)

            expect(getTwitchUserMock).toHaveBeenCalledWith('testuser')
            expect(mockPrisma.guild.findUnique).toHaveBeenCalledWith({
                where: { discordId: 'guild-123' },
            })
            expect(twitchServiceAddMock).toHaveBeenCalledWith(
                guild.id,
                expect.any(String),
                'twitch-123',
                'testuser',
            )
            expect(refreshSubscriptionsMock).toHaveBeenCalled()
            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    embeds: [
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: 'Twitch notification added',
                            }),
                        }),
                    ],
                    ephemeral: true,
                },
            })
        })

        test('creates guild if not found', async () => {
            const twitchUser = createTwitchUser()
            const guild = createGuild()
            const interaction = createInteraction()

            getTwitchUserMock.mockResolvedValueOnce(twitchUser)
            mockPrisma.guild.findUnique.mockResolvedValueOnce(null)
            mockPrisma.guild.create.mockResolvedValueOnce(guild)
            twitchServiceAddMock.mockResolvedValueOnce(true)
            refreshSubscriptionsMock.mockResolvedValueOnce(undefined)

            await handleTwitchAdd(interaction)

            expect(mockPrisma.guild.create).toHaveBeenCalledWith({
                data: {
                    discordId: 'guild-123',
                    name: 'Test Guild',
                    ownerId: 'owner-123',
                },
            })
            expect(twitchServiceAddMock).toHaveBeenCalled()
        })

        test('trims and lowercases username', async () => {
            const twitchUser = createTwitchUser()
            const guild = createGuild()
            const interaction = createInteraction({ username: '  TestUser  ' })

            getTwitchUserMock.mockResolvedValueOnce(twitchUser)
            mockPrisma.guild.findUnique.mockResolvedValueOnce(guild)
            twitchServiceAddMock.mockResolvedValueOnce(true)
            refreshSubscriptionsMock.mockResolvedValueOnce(undefined)

            await handleTwitchAdd(interaction)

            expect(getTwitchUserMock).toHaveBeenCalledWith('testuser')
        })

        test('sends error when Twitch user not found', async () => {
            const interaction = createInteraction()
            getTwitchUserMock.mockResolvedValueOnce(null)

            await handleTwitchAdd(interaction)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    embeds: [
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: 'Twitch user not found',
                            }),
                        }),
                    ],
                    ephemeral: true,
                },
            })
            expect(twitchServiceAddMock).not.toHaveBeenCalled()
        })

        test('sends error when channel is invalid', async () => {
            const twitchUser = createTwitchUser()
            const interaction = createInteraction({ channel: null })
            interaction.channel = null

            getTwitchUserMock.mockResolvedValueOnce(twitchUser)

            await handleTwitchAdd(interaction)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    embeds: [
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: 'Error',
                                description: expect.stringContaining('channel'),
                            }),
                        }),
                    ],
                    ephemeral: true,
                },
            })
        })

        test('sends error when service returns false', async () => {
            const twitchUser = createTwitchUser()
            const guild = createGuild()
            const interaction = createInteraction()

            getTwitchUserMock.mockResolvedValueOnce(twitchUser)
            mockPrisma.guild.findUnique.mockResolvedValueOnce(guild)
            twitchServiceAddMock.mockResolvedValueOnce(false)

            await handleTwitchAdd(interaction)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    embeds: [
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: 'Error',
                                description: expect.stringContaining('Failed'),
                            }),
                        }),
                    ],
                    ephemeral: true,
                },
            })
            expect(refreshSubscriptionsMock).not.toHaveBeenCalled()
        })

        test('uses channel option when provided', async () => {
            const twitchUser = createTwitchUser()
            const guild = createGuild()
            const channelOption = createChannel('custom-channel-123')
            const interaction = createInteraction({ channel: channelOption })

            getTwitchUserMock.mockResolvedValueOnce(twitchUser)
            mockPrisma.guild.findUnique.mockResolvedValueOnce(guild)
            twitchServiceAddMock.mockResolvedValueOnce(true)
            refreshSubscriptionsMock.mockResolvedValueOnce(undefined)

            await handleTwitchAdd(interaction)

            expect(twitchServiceAddMock).toHaveBeenCalledWith(
                guild.id,
                'custom-channel-123',
                'twitch-123',
                'testuser',
            )
        })
    })

    describe('handleTwitchRemove', () => {
        test('removes notification successfully', async () => {
            const twitchUser = createTwitchUser()
            const guild = createGuild()
            const interaction = createInteraction()

            getTwitchUserMock.mockResolvedValueOnce(twitchUser)
            mockPrisma.guild.findUnique.mockResolvedValueOnce(guild)
            twitchServiceRemoveMock.mockResolvedValueOnce(true)
            refreshSubscriptionsMock.mockResolvedValueOnce(undefined)

            await handleTwitchRemove(interaction)

            expect(getTwitchUserMock).toHaveBeenCalledWith('testuser')
            expect(twitchServiceRemoveMock).toHaveBeenCalledWith(
                guild.id,
                'twitch-123',
            )
            expect(refreshSubscriptionsMock).toHaveBeenCalled()
            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    embeds: [
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: 'Twitch notification removed',
                            }),
                        }),
                    ],
                    ephemeral: true,
                },
            })
        })

        test('sends error when Twitch user not found', async () => {
            const interaction = createInteraction()
            getTwitchUserMock.mockResolvedValueOnce(null)

            await handleTwitchRemove(interaction)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    embeds: [
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: 'Twitch user not found',
                            }),
                        }),
                    ],
                    ephemeral: true,
                },
            })
            expect(twitchServiceRemoveMock).not.toHaveBeenCalled()
        })

        test('sends error when guild not found', async () => {
            const twitchUser = createTwitchUser()
            const interaction = createInteraction()

            getTwitchUserMock.mockResolvedValueOnce(twitchUser)
            mockPrisma.guild.findUnique.mockResolvedValueOnce(null)

            await handleTwitchRemove(interaction)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    embeds: [
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: 'Not found',
                            }),
                        }),
                    ],
                    ephemeral: true,
                },
            })
            expect(twitchServiceRemoveMock).not.toHaveBeenCalled()
        })

        test('sends error when service returns false', async () => {
            const twitchUser = createTwitchUser()
            const guild = createGuild()
            const interaction = createInteraction()

            getTwitchUserMock.mockResolvedValueOnce(twitchUser)
            mockPrisma.guild.findUnique.mockResolvedValueOnce(guild)
            twitchServiceRemoveMock.mockResolvedValueOnce(false)

            await handleTwitchRemove(interaction)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    embeds: [
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: 'Error',
                                description: expect.stringContaining('Failed'),
                            }),
                        }),
                    ],
                    ephemeral: true,
                },
            })
            expect(refreshSubscriptionsMock).not.toHaveBeenCalled()
        })

        test('trims and lowercases username', async () => {
            const twitchUser = createTwitchUser()
            const guild = createGuild()
            const interaction = createInteraction({ username: '  TestUser  ' })

            getTwitchUserMock.mockResolvedValueOnce(twitchUser)
            mockPrisma.guild.findUnique.mockResolvedValueOnce(guild)
            twitchServiceRemoveMock.mockResolvedValueOnce(true)
            refreshSubscriptionsMock.mockResolvedValueOnce(undefined)

            await handleTwitchRemove(interaction)

            expect(getTwitchUserMock).toHaveBeenCalledWith('testuser')
        })
    })

    describe('handleTwitchList', () => {
        test('lists notifications successfully', async () => {
            const guild = createGuild()
            const notifications = [
                {
                    twitchLogin: 'streamer1',
                    discordChannelId: 'channel-1',
                },
                {
                    twitchLogin: 'streamer2',
                    discordChannelId: 'channel-2',
                },
            ]
            const interaction = createInteraction()

            mockPrisma.guild.findUnique.mockResolvedValueOnce(guild)
            twitchServiceListMock.mockResolvedValueOnce(notifications)

            await handleTwitchList(interaction)

            expect(twitchServiceListMock).toHaveBeenCalledWith(guild.id)
            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    embeds: [
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: 'Twitch notifications',
                                description:
                                    expect.stringContaining('streamer1'),
                            }),
                        }),
                    ],
                    ephemeral: true,
                },
            })
        })

        test('shows empty message when guild not found', async () => {
            const interaction = createInteraction()
            mockPrisma.guild.findUnique.mockResolvedValueOnce(null)

            await handleTwitchList(interaction)

            expect(twitchServiceListMock).not.toHaveBeenCalled()
            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    embeds: [
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: 'Twitch notifications',
                                description: expect.stringContaining(
                                    'No Twitch streamers',
                                ),
                            }),
                        }),
                    ],
                    ephemeral: true,
                },
            })
        })

        test('shows empty message when no notifications found', async () => {
            const guild = createGuild()
            const interaction = createInteraction()

            mockPrisma.guild.findUnique.mockResolvedValueOnce(guild)
            twitchServiceListMock.mockResolvedValueOnce([])

            await handleTwitchList(interaction)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    embeds: [
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: 'Twitch notifications',
                                description: expect.stringContaining(
                                    'No Twitch streamers',
                                ),
                            }),
                        }),
                    ],
                    ephemeral: true,
                },
            })
        })

        test('formats notification list correctly', async () => {
            const guild = createGuild()
            const notifications = [
                {
                    twitchLogin: 'alice',
                    discordChannelId: 'ch-1',
                },
                {
                    twitchLogin: 'bob',
                    discordChannelId: 'ch-2',
                },
                {
                    twitchLogin: 'charlie',
                    discordChannelId: 'ch-3',
                },
            ]
            const interaction = createInteraction()

            mockPrisma.guild.findUnique.mockResolvedValueOnce(guild)
            twitchServiceListMock.mockResolvedValueOnce(notifications)

            await handleTwitchList(interaction)

            const call = interactionReplyMock.mock.calls[0][0]
            const desc = call.content.embeds[0].data.description
            expect(desc).toContain('• **alice**')
            expect(desc).toContain('• **bob**')
            expect(desc).toContain('• **charlie**')
            expect(desc).toContain('<#ch-1>')
            expect(desc).toContain('<#ch-2>')
            expect(desc).toContain('<#ch-3>')
        })

        test('marks reply as ephemeral', async () => {
            const guild = createGuild()
            const notifications = [
                {
                    twitchLogin: 'streamer',
                    discordChannelId: 'channel-1',
                },
            ]
            const interaction = createInteraction()

            mockPrisma.guild.findUnique.mockResolvedValueOnce(guild)
            twitchServiceListMock.mockResolvedValueOnce(notifications)

            await handleTwitchList(interaction)

            const call = interactionReplyMock.mock.calls[0][0]
            expect(call.content.ephemeral).toBe(true)
        })
    })
})
