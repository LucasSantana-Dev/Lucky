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
}))

import {
    subscribeToStreamOnline,
    handleStreamOnline,
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
            await subscribeToStreamOnline(
                'session123',
                'client-id',
                subscribedUserIds,
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
    })
})
