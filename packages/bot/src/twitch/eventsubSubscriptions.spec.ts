import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals'
import type { Client, TextBasedChannel } from 'discord.js'

const getTwitchUserAccessTokenMock = jest.fn()
const getDistinctTwitchUserIdsMock = jest.fn()
const getNotificationsByTwitchUserIdMock = jest.fn()
const debugLogMock = jest.fn()
const warnLogMock = jest.fn()
const errorLogMock = jest.fn()

jest.mock('./token', () => ({
    getTwitchUserAccessToken: getTwitchUserAccessTokenMock,
}))

jest.mock('@lucky/shared/services', () => ({
    twitchNotificationService: {
        getDistinctTwitchUserIds: getDistinctTwitchUserIdsMock,
        getNotificationsByTwitchUserId: getNotificationsByTwitchUserIdMock,
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: errorLogMock,
    debugLog: debugLogMock,
    warnLog: warnLogMock,
}))

import {
    subscribeToStreamOnline,
    subscribeToStreamOffline,
    subscribeToChannelUpdate,
    subscribeToChannelRaid,
    handleStreamOnline,
    handleStreamOffline,
    handleChannelUpdate,
    handleChannelRaid,
} from './eventsubSubscriptions'

describe('eventsubSubscriptions', () => {
    let fetchSpy: jest.SpyInstance

    beforeEach(() => {
        jest.clearAllMocks()
        fetchSpy = jest.spyOn(global, 'fetch')
        process.env.TWITCH_CLIENT_ID = 'test-client-id'
    })

    afterEach(() => {
        fetchSpy.mockRestore()
        delete process.env.TWITCH_CLIENT_ID
    })

    describe('subscribeToStreamOnline', () => {
        beforeEach(() => {
            getTwitchUserAccessTokenMock.mockResolvedValue('valid-token')
        })

        it('should return early if token is not available', async () => {
            getTwitchUserAccessTokenMock.mockResolvedValue(null)

            await subscribeToStreamOnline('session123', 'client-id', new Set())

            expect(fetchSpy).not.toHaveBeenCalled()
        })

        it('should return early if no streamers to subscribe', async () => {
            getDistinctTwitchUserIdsMock.mockResolvedValue([])

            const subscribedUserIds = new Set<string>()
            await subscribeToStreamOnline(
                'session123',
                'client-id',
                subscribedUserIds,
            )

            expect(debugLogMock).toHaveBeenCalledWith({
                message: 'Twitch EventSub: no streamers to subscribe to',
            })
            expect(fetchSpy).not.toHaveBeenCalled()
        })

        it('should subscribe to new streamers', async () => {
            const userIds = ['twitch1', 'twitch2']
            getDistinctTwitchUserIdsMock.mockResolvedValue(userIds)

            const mockResponse = {
                ok: true,
                text: jest.fn().mockResolvedValue(''),
            }
            fetchSpy.mockResolvedValue(mockResponse as any)

            const subscribedUserIds = new Set<string>()
            await subscribeToStreamOnline(
                'session123',
                'client-id',
                subscribedUserIds,
            )

            expect(fetchSpy).toHaveBeenCalledTimes(2)
            expect(subscribedUserIds).toContain('twitch1')
            expect(subscribedUserIds).toContain('twitch2')
        })

        it('should skip already subscribed streamers', async () => {
            const userIds = ['twitch1', 'twitch2']
            getDistinctTwitchUserIdsMock.mockResolvedValue(userIds)

            const mockResponse = {
                ok: true,
                text: jest.fn().mockResolvedValue(''),
            }
            fetchSpy.mockResolvedValue(mockResponse as any)

            const subscribedUserIds = new Set(['twitch1'])
            await subscribeToStreamOnline(
                'session123',
                'client-id',
                subscribedUserIds,
            )

            expect(fetchSpy).toHaveBeenCalledTimes(1)
        })

        it('should send correct API request format', async () => {
            const userIds = ['twitch123']
            getDistinctTwitchUserIdsMock.mockResolvedValue(userIds)

            const mockResponse = {
                ok: true,
                text: jest.fn().mockResolvedValue(''),
            }
            fetchSpy.mockResolvedValue(mockResponse as any)

            await subscribeToStreamOnline('session123', 'client-id', new Set())

            expect(fetchSpy).toHaveBeenCalledWith(
                'https://api.twitch.tv/helix/eventsub/subscriptions',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'Content-Type': 'application/json',
                        Authorization: 'Bearer valid-token',
                        'Client-Id': 'client-id',
                    }),
                    body: expect.stringContaining('stream.online'),
                }),
            )
        })

        it('should handle subscription creation failure', async () => {
            const userIds = ['twitch1', 'twitch2']
            getDistinctTwitchUserIdsMock.mockResolvedValue(userIds)

            const mockResponse = {
                ok: false,
                status: 400,
                text: jest.fn().mockResolvedValue('Bad request'),
            }
            fetchSpy.mockResolvedValue(mockResponse as any)

            const subscribedUserIds = new Set<string>()
            await expect(
                subscribeToStreamOnline(
                    'session123',
                    'client-id',
                    subscribedUserIds,
                ),
            ).rejects.toThrow(
                'Twitch EventSub: failed to subscribe to any broadcasters for stream.online',
            )

            expect(errorLogMock).toHaveBeenCalled()
            expect(subscribedUserIds.size).toBe(0)
        })
    })

    describe('handleStreamOnline', () => {
        let mockClient: Partial<Client>
        let mockChannel: Partial<TextBasedChannel>

        beforeEach(() => {
            mockChannel = {
                isTextBased: jest.fn().mockReturnValue(true),
                isDMBased: jest.fn().mockReturnValue(false),
                send: jest.fn().mockResolvedValue({}),
            }

            mockClient = {
                channels: {
                    fetch: jest.fn().mockResolvedValue(mockChannel),
                },
            }
        })

        it('should send notification to all subscribed channels', async () => {
            const notifications = [
                { discordChannelId: 'channel1', twitchLogin: 'testuser' },
                { discordChannelId: 'channel2', twitchLogin: 'testuser' },
            ]
            getNotificationsByTwitchUserIdMock.mockResolvedValue(
                notifications as any,
            )

            const payload = {
                subscription: {
                    type: 'stream.online',
                    condition: { broadcaster_user_id: 'twitch123' },
                },
                event: {
                    id: 'event123',
                    broadcaster_user_id: 'twitch123',
                    broadcaster_user_login: 'testuser',
                    broadcaster_user_name: 'Test User',
                    type: 'stream.online',
                    started_at: '2024-01-01T00:00:00Z',
                },
            }

            await handleStreamOnline(payload as any, mockClient as Client)

            expect(mockClient.channels!.fetch).toHaveBeenCalledTimes(2)
            expect(mockChannel.send).toHaveBeenCalledTimes(2)
        })

        it('should return early if no notifications found', async () => {
            getNotificationsByTwitchUserIdMock.mockResolvedValue([])

            const payload = {
                subscription: {
                    type: 'stream.online',
                    condition: { broadcaster_user_id: 'twitch123' },
                },
                event: {
                    id: 'event123',
                    broadcaster_user_id: 'twitch123',
                    broadcaster_user_login: 'testuser',
                    broadcaster_user_name: 'Test User',
                    type: 'stream.online',
                    started_at: '2024-01-01T00:00:00Z',
                },
            }

            await handleStreamOnline(payload as any, mockClient as Client)

            expect(mockClient.channels!.fetch).not.toHaveBeenCalled()
        })

        it('should create embed with correct data', async () => {
            const notifications = [
                { discordChannelId: 'channel1', twitchLogin: 'testuser' },
            ]
            getNotificationsByTwitchUserIdMock.mockResolvedValue(
                notifications as any,
            )

            const payload = {
                subscription: {
                    type: 'stream.online',
                    condition: { broadcaster_user_id: 'twitch123' },
                },
                event: {
                    id: 'event123',
                    broadcaster_user_id: 'twitch123',
                    broadcaster_user_login: 'testuser',
                    broadcaster_user_name: 'Test User',
                    type: 'stream.online',
                    started_at: '2024-01-01T00:00:00Z',
                },
            }

            await handleStreamOnline(payload as any, mockClient as Client)

            const sendCall = jest.mocked(mockChannel.send).mock.calls[0]
            const embed = sendCall[0].embeds[0]

            expect(embed.data.color).toBe(0x9146ff)
            expect(embed.data.title).toContain('Test User')
            expect(embed.data.title).toContain('live')
            expect(embed.data.url).toContain('testuser')
        })

        it('should skip non-text channels', async () => {
            const nonTextChannel = {
                isTextBased: jest.fn().mockReturnValue(false),
            }
            jest.mocked(mockClient.channels!.fetch).mockResolvedValue(
                nonTextChannel as any,
            )

            const notifications = [
                { discordChannelId: 'channel1', twitchLogin: 'testuser' },
            ]
            getNotificationsByTwitchUserIdMock.mockResolvedValue(
                notifications as any,
            )

            const payload = {
                subscription: {
                    type: 'stream.online',
                    condition: { broadcaster_user_id: 'twitch123' },
                },
                event: {
                    id: 'event123',
                    broadcaster_user_id: 'twitch123',
                    broadcaster_user_login: 'testuser',
                    broadcaster_user_name: 'Test User',
                    type: 'stream.online',
                    started_at: '2024-01-01T00:00:00Z',
                },
            }

            await handleStreamOnline(payload as any, mockClient as Client)

            expect(mockChannel.send).not.toHaveBeenCalled()
            expect(warnLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Twitch EventSub: channel is not a text channel',
                }),
            )
        })

        it('should skip DM channels', async () => {
            const dmChannel = {
                isTextBased: jest.fn().mockReturnValue(true),
                isDMBased: jest.fn().mockReturnValue(true),
            }
            jest.mocked(mockClient.channels!.fetch).mockResolvedValue(
                dmChannel as any,
            )

            const notifications = [
                { discordChannelId: 'channel1', twitchLogin: 'testuser' },
            ]
            getNotificationsByTwitchUserIdMock.mockResolvedValue(
                notifications as any,
            )

            const payload = {
                subscription: {
                    type: 'stream.online',
                    condition: { broadcaster_user_id: 'twitch123' },
                },
                event: {
                    id: 'event123',
                    broadcaster_user_id: 'twitch123',
                    broadcaster_user_login: 'testuser',
                    broadcaster_user_name: 'Test User',
                    type: 'stream.online',
                    started_at: '2024-01-01T00:00:00Z',
                },
            }

            await handleStreamOnline(payload as any, mockClient as Client)

            expect(mockChannel.send).not.toHaveBeenCalled()
            expect(warnLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message:
                        'Twitch EventSub: channel is a DM channel, skipping',
                }),
            )
        })

        it('should handle channel fetch error', async () => {
            jest.mocked(mockClient.channels!.fetch).mockRejectedValue(
                new Error('Channel not found'),
            )

            const notifications = [
                { discordChannelId: 'channel1', twitchLogin: 'testuser' },
            ]
            getNotificationsByTwitchUserIdMock.mockResolvedValue(
                notifications as any,
            )

            const payload = {
                subscription: {
                    type: 'stream.online',
                    condition: { broadcaster_user_id: 'twitch123' },
                },
                event: {
                    id: 'event123',
                    broadcaster_user_id: 'twitch123',
                    broadcaster_user_login: 'testuser',
                    broadcaster_user_name: 'Test User',
                    type: 'stream.online',
                    started_at: '2024-01-01T00:00:00Z',
                },
            }

            await handleStreamOnline(payload as any, mockClient as Client)

            expect(errorLogMock).toHaveBeenCalled()
        })

        it('should use correct twitch URL format', async () => {
            const notifications = [
                { discordChannelId: 'channel1', twitchLogin: 'testuser' },
            ]
            getNotificationsByTwitchUserIdMock.mockResolvedValue(
                notifications as any,
            )

            const payload = {
                subscription: {
                    type: 'stream.online',
                    condition: { broadcaster_user_id: 'twitch123' },
                },
                event: {
                    id: 'event123',
                    broadcaster_user_id: 'twitch123',
                    broadcaster_user_login: 'testuser',
                    broadcaster_user_name: 'Test User',
                    type: 'stream.online',
                    started_at: '2024-01-01T00:00:00Z',
                },
            }

            await handleStreamOnline(payload as any, mockClient as Client)

            const sendCall = jest.mocked(mockChannel.send).mock.calls[0]
            const embed = sendCall[0].embeds[0]

            expect(embed.data.url).toBe('https://twitch.tv/testuser')
        })

        it('should handle channel send error', async () => {
            jest.mocked(mockChannel.send).mockRejectedValue(
                new Error('No permission to send message'),
            )

            const notifications = [
                { discordChannelId: 'channel1', twitchLogin: 'testuser' },
            ]
            getNotificationsByTwitchUserIdMock.mockResolvedValue(
                notifications as any,
            )

            const payload = {
                subscription: {
                    type: 'stream.online',
                    condition: { broadcaster_user_id: 'twitch123' },
                },
                event: {
                    id: 'event123',
                    broadcaster_user_id: 'twitch123',
                    broadcaster_user_login: 'testuser',
                    broadcaster_user_name: 'Test User',
                    type: 'stream.online',
                    started_at: '2024-01-01T00:00:00Z',
                },
            }

            await handleStreamOnline(payload as any, mockClient as Client)

            expect(errorLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message:
                        'Twitch EventSub: failed to send notification to channel channel1',
                }),
            )
        })

        it('should handle null channel gracefully', async () => {
            jest.mocked(mockClient.channels!.fetch).mockResolvedValue(null)

            const notifications = [
                {
                    discordChannelId: 'deleted-channel',
                    twitchLogin: 'testuser',
                },
            ]
            getNotificationsByTwitchUserIdMock.mockResolvedValue(
                notifications as any,
            )

            const payload = {
                subscription: {
                    type: 'stream.online',
                    condition: { broadcaster_user_id: 'twitch123' },
                },
                event: {
                    id: 'event123',
                    broadcaster_user_id: 'twitch123',
                    broadcaster_user_login: 'testuser',
                    broadcaster_user_name: 'Test User',
                    type: 'stream.online',
                    started_at: '2024-01-01T00:00:00Z',
                },
            }

            await handleStreamOnline(payload as any, mockClient as Client)

            expect(warnLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message:
                        'Twitch EventSub: channel not found (may be deleted or inaccessible)',
                }),
            )
            expect(mockChannel.send).not.toHaveBeenCalled()
        })

        it('should send mention when mentionRoleId is set', async () => {
            const notifications = [
                {
                    discordChannelId: 'channel1',
                    twitchLogin: 'testuser',
                    mentionRoleId: 'role123',
                },
            ]
            getNotificationsByTwitchUserIdMock.mockResolvedValue(
                notifications as any,
            )

            const payload = {
                subscription: {
                    type: 'stream.online',
                    condition: { broadcaster_user_id: 'twitch123' },
                },
                event: {
                    id: 'event123',
                    broadcaster_user_id: 'twitch123',
                    broadcaster_user_login: 'testuser',
                    broadcaster_user_name: 'Test User',
                    type: 'stream.online',
                    started_at: '2024-01-01T00:00:00Z',
                },
            }

            await handleStreamOnline(payload as any, mockClient as Client)

            expect(mockChannel.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: '<@&role123>',
                    allowedMentions: { roles: ['role123'] },
                }),
            )
        })

        it('should not send mention when mentionRoleId is not set', async () => {
            const notifications = [
                {
                    discordChannelId: 'channel1',
                    twitchLogin: 'testuser',
                    mentionRoleId: null,
                },
            ]
            getNotificationsByTwitchUserIdMock.mockResolvedValue(
                notifications as any,
            )

            const payload = {
                subscription: {
                    type: 'stream.online',
                    condition: { broadcaster_user_id: 'twitch123' },
                },
                event: {
                    id: 'event123',
                    broadcaster_user_id: 'twitch123',
                    broadcaster_user_login: 'testuser',
                    broadcaster_user_name: 'Test User',
                    type: 'stream.online',
                    started_at: '2024-01-01T00:00:00Z',
                },
            }

            await handleStreamOnline(payload as any, mockClient as Client)

            expect(mockChannel.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: undefined,
                    allowedMentions: undefined,
                }),
            )
        })
    })

    describe('handleStreamOffline', () => {
        let mockClient: Partial<Client>
        let mockChannel: Partial<TextBasedChannel>

        beforeEach(() => {
            mockChannel = {
                isTextBased: jest.fn().mockReturnValue(true),
                isDMBased: jest.fn().mockReturnValue(false),
                send: jest.fn().mockResolvedValue({}),
            }

            mockClient = {
                channels: {
                    fetch: jest.fn().mockResolvedValue(mockChannel),
                },
            }
        })

        it('should send notification to all subscribed channels', async () => {
            const notifications = [
                { discordChannelId: 'channel1', twitchLogin: 'testuser' },
                { discordChannelId: 'channel2', twitchLogin: 'testuser' },
            ]
            getNotificationsByTwitchUserIdMock.mockResolvedValue(
                notifications as any,
            )

            const payload = {
                subscription: {
                    type: 'stream.offline',
                    condition: { broadcaster_user_id: 'twitch123' },
                },
                event: {
                    broadcaster_user_id: 'twitch123',
                    broadcaster_user_login: 'testuser',
                    broadcaster_user_name: 'Test User',
                },
            }

            await handleStreamOffline(payload as any, mockClient as Client)

            expect(mockClient.channels!.fetch).toHaveBeenCalledTimes(2)
            expect(mockChannel.send).toHaveBeenCalledTimes(2)
        })

        it('should create embed with offline color and title', async () => {
            const notifications = [
                { discordChannelId: 'channel1', twitchLogin: 'testuser' },
            ]
            getNotificationsByTwitchUserIdMock.mockResolvedValue(
                notifications as any,
            )

            const payload = {
                subscription: {
                    type: 'stream.offline',
                    condition: { broadcaster_user_id: 'twitch123' },
                },
                event: {
                    broadcaster_user_id: 'twitch123',
                    broadcaster_user_login: 'testuser',
                    broadcaster_user_name: 'Test User',
                },
            }

            await handleStreamOffline(payload as any, mockClient as Client)

            const sendCall = jest.mocked(mockChannel.send).mock.calls[0]
            const embed = sendCall[0].embeds[0]

            expect(embed.data.color).toBe(0x6b7280)
            expect(embed.data.title).toContain('Test User')
            expect(embed.data.title).toContain('offline')
            expect(embed.data.url).toBe('https://twitch.tv/testuser')
            expect(embed.data.description).toContain('ended')
        })
    })

    describe('handleChannelUpdate', () => {
        let mockClient: Partial<Client>
        let mockChannel: Partial<TextBasedChannel>

        beforeEach(() => {
            mockChannel = {
                isTextBased: jest.fn().mockReturnValue(true),
                isDMBased: jest.fn().mockReturnValue(false),
                send: jest.fn().mockResolvedValue({}),
            }

            mockClient = {
                channels: {
                    fetch: jest.fn().mockResolvedValue(mockChannel),
                },
            }
        })

        it('should create embed with update color and title', async () => {
            const notifications = [
                { discordChannelId: 'channel1', twitchLogin: 'testuser' },
            ]
            getNotificationsByTwitchUserIdMock.mockResolvedValue(
                notifications as any,
            )

            const payload = {
                subscription: {
                    type: 'channel.update',
                    condition: { broadcaster_user_id: 'twitch123' },
                },
                event: {
                    broadcaster_user_id: 'twitch123',
                    broadcaster_user_login: 'testuser',
                    broadcaster_user_name: 'Test User',
                    title: 'New Stream Title',
                    category_id: 'cat123',
                    category_name: 'Just Chatting',
                    content_classification_labels: [],
                },
            }

            await handleChannelUpdate(payload as any, mockClient as Client)

            const sendCall = jest.mocked(mockChannel.send).mock.calls[0]
            const embed = sendCall[0].embeds[0]

            expect(embed.data.color).toBe(0x9146ff)
            expect(embed.data.title).toContain('Test User')
            expect(embed.data.title).toContain('updated')
            expect(embed.data.url).toBe('https://twitch.tv/testuser')
        })

        it('should include title and category in fields', async () => {
            const notifications = [
                { discordChannelId: 'channel1', twitchLogin: 'testuser' },
            ]
            getNotificationsByTwitchUserIdMock.mockResolvedValue(
                notifications as any,
            )

            const payload = {
                subscription: {
                    type: 'channel.update',
                    condition: { broadcaster_user_id: 'twitch123' },
                },
                event: {
                    broadcaster_user_id: 'twitch123',
                    broadcaster_user_login: 'testuser',
                    broadcaster_user_name: 'Test User',
                    title: 'Awesome New Title',
                    category_id: 'cat123',
                    category_name: 'Just Chatting',
                    content_classification_labels: [],
                },
            }

            await handleChannelUpdate(payload as any, mockClient as Client)

            const sendCall = jest.mocked(mockChannel.send).mock.calls[0]
            const embed = sendCall[0].embeds[0]
            const titleField = embed.data.fields!.find(
                (f: any) => f.name === 'Title',
            )
            const categoryField = embed.data.fields!.find(
                (f: any) => f.name === 'Category',
            )

            expect(titleField).toBeDefined()
            expect(titleField?.value).toBe('Awesome New Title')
            expect(categoryField).toBeDefined()
            expect(categoryField?.value).toBe('Just Chatting')
        })

        it('should use em-dash fallback when title is empty', async () => {
            const notifications = [
                { discordChannelId: 'channel1', twitchLogin: 'testuser' },
            ]
            getNotificationsByTwitchUserIdMock.mockResolvedValue(
                notifications as any,
            )

            const payload = {
                subscription: {
                    type: 'channel.update',
                    condition: { broadcaster_user_id: 'twitch123' },
                },
                event: {
                    broadcaster_user_id: 'twitch123',
                    broadcaster_user_login: 'testuser',
                    broadcaster_user_name: 'Test User',
                    title: '',
                    category_id: 'cat123',
                    category_name: 'Just Chatting',
                    content_classification_labels: [],
                },
            }

            await handleChannelUpdate(payload as any, mockClient as Client)

            const sendCall = jest.mocked(mockChannel.send).mock.calls[0]
            const embed = sendCall[0].embeds[0]
            const titleField = embed.data.fields!.find(
                (f: any) => f.name === 'Title',
            )

            expect(titleField?.value).toBe('—')
        })

        it('should use em-dash fallback when category is empty', async () => {
            const notifications = [
                { discordChannelId: 'channel1', twitchLogin: 'testuser' },
            ]
            getNotificationsByTwitchUserIdMock.mockResolvedValue(
                notifications as any,
            )

            const payload = {
                subscription: {
                    type: 'channel.update',
                    condition: { broadcaster_user_id: 'twitch123' },
                },
                event: {
                    broadcaster_user_id: 'twitch123',
                    broadcaster_user_login: 'testuser',
                    broadcaster_user_name: 'Test User',
                    title: 'Some Title',
                    category_id: 'cat123',
                    category_name: '',
                    content_classification_labels: [],
                },
            }

            await handleChannelUpdate(payload as any, mockClient as Client)

            const sendCall = jest.mocked(mockChannel.send).mock.calls[0]
            const embed = sendCall[0].embeds[0]
            const categoryField = embed.data.fields!.find(
                (f: any) => f.name === 'Category',
            )

            expect(categoryField?.value).toBe('—')
        })
    })

    describe('handleChannelRaid', () => {
        let mockClient: Partial<Client>
        let mockChannel: Partial<TextBasedChannel>

        beforeEach(() => {
            mockChannel = {
                isTextBased: jest.fn().mockReturnValue(true),
                isDMBased: jest.fn().mockReturnValue(false),
                send: jest.fn().mockResolvedValue({}),
            }

            mockClient = {
                channels: {
                    fetch: jest.fn().mockResolvedValue(mockChannel),
                },
            }
        })

        it('should lookup notifications by to_broadcaster_user_id', async () => {
            const notifications = [
                { discordChannelId: 'channel1', twitchLogin: 'targetuser' },
            ]
            getNotificationsByTwitchUserIdMock.mockResolvedValue(
                notifications as any,
            )

            const payload = {
                subscription: {
                    type: 'channel.raid',
                    condition: { to_broadcaster_user_id: 'to-user-id' },
                },
                event: {
                    from_broadcaster_user_id: 'from-user-id',
                    from_broadcaster_user_login: 'fromuser',
                    from_broadcaster_user_name: 'From User',
                    to_broadcaster_user_id: 'to-user-id',
                    to_broadcaster_user_login: 'touser',
                    to_broadcaster_user_name: 'To User',
                    viewers: 100,
                },
            }

            await handleChannelRaid(payload as any, mockClient as Client)

            expect(getNotificationsByTwitchUserIdMock).toHaveBeenCalledWith(
                'to-user-id',
            )
        })

        it('should create embed with raid color and title', async () => {
            const notifications = [
                { discordChannelId: 'channel1', twitchLogin: 'touser' },
            ]
            getNotificationsByTwitchUserIdMock.mockResolvedValue(
                notifications as any,
            )

            const payload = {
                subscription: {
                    type: 'channel.raid',
                    condition: { to_broadcaster_user_id: 'to-user-id' },
                },
                event: {
                    from_broadcaster_user_id: 'from-user-id',
                    from_broadcaster_user_login: 'fromuser',
                    from_broadcaster_user_name: 'From User',
                    to_broadcaster_user_id: 'to-user-id',
                    to_broadcaster_user_login: 'touser',
                    to_broadcaster_user_name: 'To User',
                    viewers: 100,
                },
            }

            await handleChannelRaid(payload as any, mockClient as Client)

            const sendCall = jest.mocked(mockChannel.send).mock.calls[0]
            const embed = sendCall[0].embeds[0]

            expect(embed.data.color).toBe(0x9146ff)
            expect(embed.data.title).toContain('To User')
            expect(embed.data.title).toContain('Raid')
            expect(embed.data.url).toBe('https://twitch.tv/touser')
        })

        it('should include raider name and formatted viewer count in description', async () => {
            const notifications = [
                { discordChannelId: 'channel1', twitchLogin: 'touser' },
            ]
            getNotificationsByTwitchUserIdMock.mockResolvedValue(
                notifications as any,
            )

            const payload = {
                subscription: {
                    type: 'channel.raid',
                    condition: { to_broadcaster_user_id: 'to-user-id' },
                },
                event: {
                    from_broadcaster_user_id: 'from-user-id',
                    from_broadcaster_user_login: 'fromuser',
                    from_broadcaster_user_name: 'From User',
                    to_broadcaster_user_id: 'to-user-id',
                    to_broadcaster_user_login: 'touser',
                    to_broadcaster_user_name: 'To User',
                    viewers: 1234,
                },
            }

            await handleChannelRaid(payload as any, mockClient as Client)

            const sendCall = jest.mocked(mockChannel.send).mock.calls[0]
            const embed = sendCall[0].embeds[0]

            expect(embed.data.description).toContain('From User')
            expect(embed.data.description).toContain('To User')
            expect(embed.data.description).toContain('1,234')
        })
    })

    describe('subscribeToStreamOffline', () => {
        beforeEach(() => {
            getTwitchUserAccessTokenMock.mockResolvedValue('valid-token')
            getDistinctTwitchUserIdsMock.mockResolvedValue(['twitch123'])
        })

        it('should send correct API request format for stream.offline', async () => {
            const mockResponse = {
                ok: true,
                text: jest.fn().mockResolvedValue(''),
            }
            fetchSpy.mockResolvedValue(mockResponse as any)

            await subscribeToStreamOffline('session123', 'client-id', new Set())

            const callBody = JSON.parse(
                jest.mocked(global.fetch).mock.calls[0][1]?.body as string,
            )

            expect(callBody.type).toBe('stream.offline')
            expect(callBody.version).toBe('1')
        })
    })

    describe('subscribeToChannelUpdate', () => {
        beforeEach(() => {
            getTwitchUserAccessTokenMock.mockResolvedValue('valid-token')
            getDistinctTwitchUserIdsMock.mockResolvedValue(['twitch123'])
        })

        it('should send correct API request format for channel.update', async () => {
            const mockResponse = {
                ok: true,
                text: jest.fn().mockResolvedValue(''),
            }
            fetchSpy.mockResolvedValue(mockResponse as any)

            await subscribeToChannelUpdate('session123', 'client-id', new Set())

            const callBody = JSON.parse(
                jest.mocked(global.fetch).mock.calls[0][1]?.body as string,
            )

            expect(callBody.type).toBe('channel.update')
            expect(callBody.version).toBe('2')
        })
    })

    describe('subscribeToChannelRaid', () => {
        beforeEach(() => {
            getTwitchUserAccessTokenMock.mockResolvedValue('valid-token')
            getDistinctTwitchUserIdsMock.mockResolvedValue(['twitch123'])
        })

        it('should send correct API request format for channel.raid with to_broadcaster_user_id', async () => {
            const mockResponse = {
                ok: true,
                text: jest.fn().mockResolvedValue(''),
            }
            fetchSpy.mockResolvedValue(mockResponse as any)

            await subscribeToChannelRaid('session123', 'client-id', new Set())

            const callBody = JSON.parse(
                jest.mocked(global.fetch).mock.calls[0][1]?.body as string,
            )

            expect(callBody.type).toBe('channel.raid')
            expect(callBody.version).toBe('1')
            expect(callBody.condition).toHaveProperty('to_broadcaster_user_id')
            expect(callBody.condition.to_broadcaster_user_id).toBe('twitch123')
        })
    })
})
