import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals'
import type {
    ChatInputCommandInteraction,
    TextBasedChannel,
    Guild,
    User,
} from 'discord.js'

const interactionReplyMock = jest.fn()
const twitchNotificationServiceMock = jest.fn()
const getPrismaClientMock = jest.fn()
const getTwitchUserByLoginMock = jest.fn()
const refreshTwitchSubscriptionsMock = jest.fn()
const errorEmbedMock = jest.fn()
const successEmbedMock = jest.fn()

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: interactionReplyMock,
}))

jest.mock('@lucky/shared/services', () => {
    const addMock = jest.fn()
    const removeMock = jest.fn()
    const listMock = jest.fn()
    return {
        twitchNotificationService: {
            add: addMock,
            remove: removeMock,
            listByGuild: listMock,
        },
    }
})

jest.mock('@lucky/shared/utils', () => ({
    getPrismaClient: getPrismaClientMock,
    errorLog: jest.fn(),
    infoLog: jest.fn(),
}))

jest.mock('../../../twitch/twitchApi', () => ({
    getTwitchUserByLogin: getTwitchUserByLoginMock,
}))

jest.mock('../../../twitch', () => ({
    refreshTwitchSubscriptions: refreshTwitchSubscriptionsMock,
}))

jest.mock('../../../utils/general/embeds', () => ({
    errorEmbed: errorEmbedMock,
    successEmbed: successEmbedMock,
}))

import { twitchNotificationService } from '@lucky/shared/services'

import {
    handleTwitchAdd,
    handleTwitchRemove,
    handleTwitchList,
} from './twitchHandlers'

describe('twitchHandlers', () => {
    let mockInteraction: Partial<ChatInputCommandInteraction>
    let mockGuild: Partial<Guild>
    let mockUser: Partial<User>
    let mockChannel: Partial<TextBasedChannel>
    let mockPrisma: any
    let mockGetString: jest.Mock
    let mockGetChannel: jest.Mock

    beforeEach(() => {
        jest.clearAllMocks()

        mockUser = {
            id: 'user123',
        }

        mockChannel = {
            id: 'channel123',
        }

        mockGuild = {
            id: 'guild123',
            name: 'Test Guild',
        }

        mockPrisma = {
            guild: {
                findUnique: jest.fn(),
                create: jest.fn(),
            },
        }

        mockGetString = jest.fn()
        mockGetChannel = jest.fn()

        mockInteraction = {
            guild: mockGuild as Guild,
            user: mockUser as User,
            channel: mockChannel as TextBasedChannel,
            options: {
                getString: mockGetString,
                getChannel: mockGetChannel,
            },
        }

        getPrismaClientMock.mockReturnValue(mockPrisma)
        errorEmbedMock.mockReturnValue({} as any)
        successEmbedMock.mockReturnValue({} as any)
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    describe('handleTwitchAdd', () => {
        beforeEach(() => {
            mockGetString.mockReturnValue('testuser')
            mockGetChannel.mockReturnValue(null)
            mockPrisma.guild.findUnique.mockResolvedValue({ id: 'guildDbId' })
            jest.mocked(twitchNotificationService.add).mockResolvedValue(true)
        })

        it('should add a twitch notification successfully', async () => {
            const twitchUser = {
                id: 'twitch123',
                login: 'testuser',
                display_name: 'TestUser',
            }
            getTwitchUserByLoginMock.mockResolvedValue(twitchUser)
            jest.mocked(twitchNotificationService.add).mockResolvedValue(true)

            await handleTwitchAdd(
                mockInteraction as ChatInputCommandInteraction,
            )

            expect(getTwitchUserByLoginMock).toHaveBeenCalledWith('testuser')
            expect(refreshTwitchSubscriptionsMock).toHaveBeenCalled()
            expect(interactionReplyMock).toHaveBeenCalled()
        })

        it('should trim and lowercase username', async () => {
            mockGetString.mockReturnValue('  TestUser  ')
            const twitchUser = {
                id: 'twitch123',
                login: 'testuser',
                display_name: 'TestUser',
            }
            getTwitchUserByLoginMock.mockResolvedValue(twitchUser)
            jest.mocked(twitchNotificationService.add).mockResolvedValue(true)

            await handleTwitchAdd(
                mockInteraction as ChatInputCommandInteraction,
            )

            expect(getTwitchUserByLoginMock).toHaveBeenCalledWith('testuser')
        })

        it('should use channel option if provided', async () => {
            const optionChannel = { id: 'option-channel-123' }
            mockGetChannel.mockReturnValue(optionChannel as any)
            const twitchUser = {
                id: 'twitch123',
                login: 'testuser',
                display_name: 'TestUser',
            }
            getTwitchUserByLoginMock.mockResolvedValue(twitchUser)
            jest.mocked(twitchNotificationService.add).mockResolvedValue(true)

            await handleTwitchAdd(
                mockInteraction as ChatInputCommandInteraction,
            )

            expect(interactionReplyMock).toHaveBeenCalled()
        })

        it('should reply with error if twitch user not found', async () => {
            getTwitchUserByLoginMock.mockResolvedValue(null)

            await handleTwitchAdd(
                mockInteraction as ChatInputCommandInteraction,
            )

            expect(interactionReplyMock).toHaveBeenCalled()
        })

        it('should create guild if it does not exist', async () => {
            mockPrisma.guild.findUnique.mockResolvedValue(null)
            mockPrisma.guild.create.mockResolvedValue({ id: 'newGuildId' })
            const twitchUser = {
                id: 'twitch123',
                login: 'testuser',
                display_name: 'TestUser',
            }
            getTwitchUserByLoginMock.mockResolvedValue(twitchUser)
            jest.mocked(twitchNotificationService.add).mockResolvedValue(true)

            await handleTwitchAdd(
                mockInteraction as ChatInputCommandInteraction,
            )

            expect(mockPrisma.guild.create).toHaveBeenCalled()
        })

        it('should reply with error if notification add fails', async () => {
            const twitchUser = {
                id: 'twitch123',
                login: 'testuser',
                display_name: 'TestUser',
            }
            getTwitchUserByLoginMock.mockResolvedValue(twitchUser)
            jest.mocked(twitchNotificationService.add).mockResolvedValue(false)

            await handleTwitchAdd(
                mockInteraction as ChatInputCommandInteraction,
            )

            expect(interactionReplyMock).toHaveBeenCalled()
            expect(refreshTwitchSubscriptionsMock).not.toHaveBeenCalled()
        })
    })

    describe('handleTwitchRemove', () => {
        beforeEach(() => {
            mockGetString.mockReturnValue('testuser')
            mockPrisma.guild.findUnique.mockResolvedValue({ id: 'guildDbId' })
            jest.mocked(twitchNotificationService.remove).mockResolvedValue(
                true,
            )
        })

        it('should remove a twitch notification successfully', async () => {
            const twitchUser = {
                id: 'twitch123',
                login: 'testuser',
                display_name: 'TestUser',
            }
            getTwitchUserByLoginMock.mockResolvedValue(twitchUser)
            jest.mocked(twitchNotificationService.remove).mockResolvedValue(
                true,
            )

            await handleTwitchRemove(
                mockInteraction as ChatInputCommandInteraction,
            )

            expect(refreshTwitchSubscriptionsMock).toHaveBeenCalled()
        })

        it('should reply with error if twitch user not found', async () => {
            getTwitchUserByLoginMock.mockResolvedValue(null)

            await handleTwitchRemove(
                mockInteraction as ChatInputCommandInteraction,
            )

            expect(interactionReplyMock).toHaveBeenCalled()
        })

        it('should reply with error if guild does not exist', async () => {
            const twitchUser = {
                id: 'twitch123',
                login: 'testuser',
                display_name: 'TestUser',
            }
            getTwitchUserByLoginMock.mockResolvedValue(twitchUser)
            mockPrisma.guild.findUnique.mockResolvedValue(null)

            await handleTwitchRemove(
                mockInteraction as ChatInputCommandInteraction,
            )

            expect(interactionReplyMock).toHaveBeenCalled()
        })

        it('should reply with error if removal fails', async () => {
            const twitchUser = {
                id: 'twitch123',
                login: 'testuser',
                display_name: 'TestUser',
            }
            getTwitchUserByLoginMock.mockResolvedValue(twitchUser)
            jest.mocked(twitchNotificationService.remove).mockResolvedValue(
                false,
            )

            await handleTwitchRemove(
                mockInteraction as ChatInputCommandInteraction,
            )

            expect(interactionReplyMock).toHaveBeenCalled()
            expect(refreshTwitchSubscriptionsMock).not.toHaveBeenCalled()
        })
    })

    describe('handleTwitchList', () => {
        beforeEach(() => {
            mockPrisma.guild.findUnique.mockResolvedValue({ id: 'guildDbId' })
            jest.mocked(
                twitchNotificationService.listByGuild,
            ).mockResolvedValue([])
        })

        it('should reply with empty list if guild does not exist', async () => {
            mockPrisma.guild.findUnique.mockResolvedValue(null)

            await handleTwitchList(
                mockInteraction as ChatInputCommandInteraction,
            )

            expect(interactionReplyMock).toHaveBeenCalled()
        })

        it('should reply with empty list if no notifications found', async () => {
            jest.mocked(
                twitchNotificationService.listByGuild,
            ).mockResolvedValue([])

            await handleTwitchList(
                mockInteraction as ChatInputCommandInteraction,
            )

            expect(interactionReplyMock).toHaveBeenCalled()
        })

        it('should list all twitch notifications for guild', async () => {
            const notifications = [
                { twitchLogin: 'user1', discordChannelId: 'channel1' },
                { twitchLogin: 'user2', discordChannelId: 'channel2' },
            ]
            jest.mocked(
                twitchNotificationService.listByGuild,
            ).mockResolvedValue(notifications as any)

            await handleTwitchList(
                mockInteraction as ChatInputCommandInteraction,
            )

            expect(interactionReplyMock).toHaveBeenCalled()
        })
    })
})
