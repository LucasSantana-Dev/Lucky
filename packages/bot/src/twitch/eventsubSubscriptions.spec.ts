import { describe, test, expect, jest, beforeEach } from '@jest/globals'

jest.mock('./token.js', () => ({
    getTwitchUserAccessToken: jest.fn(),
}))

jest.mock('@lucky/shared/services', () => ({
    twitchNotificationService: {
        getDistinctTwitchUserIds: jest.fn(),
        getNotificationsByTwitchUserId: jest.fn(),
    },
}))

jest.mock('discord.js', () => {
    class MockEmbedBuilder {
        setColor() {
            return this
        }
        setTitle() {
            return this
        }
        setURL() {
            return this
        }
        setDescription() {
            return this
        }
        addFields() {
            return this
        }
        setTimestamp() {
            return this
        }
        setFooter() {
            return this
        }
    }
    return {
        EmbedBuilder: MockEmbedBuilder,
    }
})

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    debugLog: jest.fn(),
}))

global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>

import {
    subscribeToStreamOnline,
    handleStreamOnline,
} from './eventsubSubscriptions.js'
import { getTwitchUserAccessToken } from './token.js'
import { twitchNotificationService } from '@lucky/shared/services'
import { errorLog, debugLog } from '@lucky/shared/utils'

const getTwitchTokenMock = getTwitchUserAccessToken as jest.MockedFunction<any>
const getDistinctUserIdsMock =
    twitchNotificationService.getDistinctTwitchUserIds as jest.MockedFunction<any>
const getNotificationsMock =
    twitchNotificationService.getNotificationsByTwitchUserId as jest.MockedFunction<any>
const fetchMock = global.fetch as jest.MockedFunction<any>

beforeEach(() => {
    jest.clearAllMocks()
    process.env.TWITCH_CLIENT_ID = 'test-client-id'
})

describe('eventsubSubscriptions', () => {
    describe('subscribeToStreamOnline', () => {
        test('subscribes to all distinct Twitch users', async () => {
            const userIds = ['user-1', 'user-2', 'user-3']
            getTwitchTokenMock.mockResolvedValueOnce('test-token')
            getDistinctUserIdsMock.mockResolvedValueOnce(userIds)
            fetchMock.mockResolvedValue({
                ok: true,
                text: async () => '',
            })

            const subscribedSet = new Set<string>()
            await subscribeToStreamOnline(
                'session-123',
                'client-id',
                subscribedSet,
            )

            expect(fetchMock).toHaveBeenCalledTimes(3)
            userIds.forEach((userId) => {
                expect(fetchMock).toHaveBeenCalledWith(
                    expect.stringContaining('subscriptions'),
                    expect.objectContaining({
                        method: 'POST',
                        body: expect.stringContaining(userId),
                    }),
                )
            })
        })

        test('skips users already subscribed', async () => {
            const userIds = ['user-1', 'user-2']
            getTwitchTokenMock.mockResolvedValueOnce('test-token')
            getDistinctUserIdsMock.mockResolvedValueOnce(userIds)
            fetchMock.mockResolvedValue({
                ok: true,
                text: async () => '',
            })

            const subscribedSet = new Set<string>(['user-1'])
            await subscribeToStreamOnline(
                'session-123',
                'client-id',
                subscribedSet,
            )

            expect(fetchMock).toHaveBeenCalledTimes(1)
            expect(fetchMock).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    body: expect.stringContaining('user-2'),
                }),
            )
        })

        test('returns early when no token available', async () => {
            getTwitchTokenMock.mockResolvedValueOnce(null)

            const subscribedSet = new Set<string>()
            await subscribeToStreamOnline(
                'session-123',
                'client-id',
                subscribedSet,
            )

            expect(getDistinctUserIdsMock).not.toHaveBeenCalled()
            expect(fetchMock).not.toHaveBeenCalled()
        })

        test('returns early when no streamers to subscribe to', async () => {
            getTwitchTokenMock.mockResolvedValueOnce('test-token')
            getDistinctUserIdsMock.mockResolvedValueOnce([])

            const subscribedSet = new Set<string>()
            await subscribeToStreamOnline(
                'session-123',
                'client-id',
                subscribedSet,
            )

            expect(debugLog).toHaveBeenCalledWith({
                message: 'Twitch EventSub: no streamers to subscribe to',
            })
            expect(fetchMock).not.toHaveBeenCalled()
        })

        test('adds successfully subscribed users to set', async () => {
            const userIds = ['user-1', 'user-2']
            getTwitchTokenMock.mockResolvedValueOnce('test-token')
            getDistinctUserIdsMock.mockResolvedValueOnce(userIds)
            fetchMock.mockResolvedValue({
                ok: true,
                text: async () => '',
            })

            const subscribedSet = new Set<string>()
            await subscribeToStreamOnline(
                'session-123',
                'client-id',
                subscribedSet,
            )

            expect(subscribedSet).toContain('user-1')
            expect(subscribedSet).toContain('user-2')
        })

        test('does not add failed subscriptions to set', async () => {
            const userIds = ['user-1', 'user-2']
            getTwitchTokenMock.mockResolvedValueOnce('test-token')
            getDistinctUserIdsMock.mockResolvedValueOnce(userIds)
            fetchMock.mockResolvedValueOnce({
                ok: true,
                text: async () => '',
            })
            fetchMock.mockResolvedValueOnce({
                ok: false,
                status: 400,
                text: async () => 'Bad request',
            })

            const subscribedSet = new Set<string>()
            await subscribeToStreamOnline(
                'session-123',
                'client-id',
                subscribedSet,
            )

            expect(subscribedSet).toContain('user-1')
            expect(subscribedSet).not.toContain('user-2')
        })

        test('sends correct subscription payload', async () => {
            getTwitchTokenMock.mockResolvedValueOnce('test-token')
            getDistinctUserIdsMock.mockResolvedValueOnce(['user-123'])
            fetchMock.mockResolvedValue({
                ok: true,
                text: async () => '',
            })

            await subscribeToStreamOnline('session-123', 'client-id', new Set())

            const call = fetchMock.mock.calls[0]
            const body = JSON.parse(call[1].body)

            expect(body).toEqual({
                type: 'stream.online',
                version: '1',
                condition: { broadcaster_user_id: 'user-123' },
                transport: { method: 'websocket', session_id: 'session-123' },
            })
        })

        test('includes correct headers in request', async () => {
            getTwitchTokenMock.mockResolvedValueOnce('test-token')
            getDistinctUserIdsMock.mockResolvedValueOnce(['user-123'])
            fetchMock.mockResolvedValue({
                ok: true,
                text: async () => '',
            })

            await subscribeToStreamOnline('session-123', 'client-id', new Set())

            const call = fetchMock.mock.calls[0]
            expect(call[1].headers).toEqual({
                'Content-Type': 'application/json',
                Authorization: 'Bearer test-token',
                'Client-Id': 'client-id',
            })
        })

        test('handles network errors gracefully', async () => {
            getTwitchTokenMock.mockResolvedValueOnce('test-token')
            getDistinctUserIdsMock.mockResolvedValueOnce(['user-123'])
            fetchMock.mockRejectedValueOnce(new Error('Network error'))

            const subscribedSet = new Set<string>()
            await subscribeToStreamOnline(
                'session-123',
                'client-id',
                subscribedSet,
            )

            expect(errorLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'create subscription error',
                    ),
                }),
            )
            expect(subscribedSet.size).toBe(0)
        })
    })

    describe('handleStreamOnline', () => {
        test('dispatches notification to all subscribed channels', async () => {
            const mockClient = {
                channels: {
                    fetch: jest.fn(),
                },
            } as any

            const mockChannel = {
                isTextBased: () => true,
                isDMBased: () => false,
                send: jest.fn(),
            }

            mockClient.channels.fetch.mockResolvedValueOnce(mockChannel)
            mockClient.channels.fetch.mockResolvedValueOnce(mockChannel)

            const notifications = [
                { discordChannelId: 'channel-1', twitchLogin: 'user1' },
                { discordChannelId: 'channel-2', twitchLogin: 'user2' },
            ]

            getNotificationsMock.mockResolvedValueOnce(notifications)

            const payload = {
                subscription: { type: 'stream.online' },
                event: {
                    id: 'event-123',
                    broadcaster_user_id: 'user-123',
                    broadcaster_user_login: 'testuser',
                    broadcaster_user_name: 'TestUser',
                    type: 'live',
                    started_at: '2024-01-01T12:00:00Z',
                },
            }

            await handleStreamOnline(payload, mockClient)

            expect(mockClient.channels.fetch).toHaveBeenCalledTimes(2)
            expect(mockChannel.send).toHaveBeenCalledTimes(2)
        })

        test('returns early when no notifications found', async () => {
            const mockClient = {
                channels: {
                    fetch: jest.fn(),
                },
            } as any

            getNotificationsMock.mockResolvedValueOnce([])

            const payload = {
                subscription: { type: 'stream.online' },
                event: {
                    id: 'event-123',
                    broadcaster_user_id: 'user-123',
                    broadcaster_user_login: 'testuser',
                    broadcaster_user_name: 'TestUser',
                    type: 'live',
                    started_at: '2024-01-01T12:00:00Z',
                },
            }

            await handleStreamOnline(payload, mockClient)

            expect(mockClient.channels.fetch).not.toHaveBeenCalled()
        })

        test('skips non-text channels', async () => {
            const mockClient = {
                channels: {
                    fetch: jest.fn(),
                },
            } as any

            const mockVoiceChannel = {
                isTextBased: () => false,
            }

            mockClient.channels.fetch.mockResolvedValueOnce(mockVoiceChannel)

            getNotificationsMock.mockResolvedValueOnce([
                { discordChannelId: 'voice-123', twitchLogin: 'user1' },
            ])

            const payload = {
                subscription: { type: 'stream.online' },
                event: {
                    id: 'event-123',
                    broadcaster_user_id: 'user-123',
                    broadcaster_user_login: 'testuser',
                    broadcaster_user_name: 'TestUser',
                    type: 'live',
                    started_at: '2024-01-01T12:00:00Z',
                },
            }

            await handleStreamOnline(payload, mockClient)

            expect(mockVoiceChannel.send).toBeUndefined()
        })

        test('skips DM channels', async () => {
            const mockClient = {
                channels: {
                    fetch: jest.fn(),
                },
            } as any

            const mockDMChannel = {
                isTextBased: () => true,
                isDMBased: () => true,
            }

            mockClient.channels.fetch.mockResolvedValueOnce(mockDMChannel)

            getNotificationsMock.mockResolvedValueOnce([
                { discordChannelId: 'dm-123', twitchLogin: 'user1' },
            ])

            const payload = {
                subscription: { type: 'stream.online' },
                event: {
                    id: 'event-123',
                    broadcaster_user_id: 'user-123',
                    broadcaster_user_login: 'testuser',
                    broadcaster_user_name: 'TestUser',
                    type: 'live',
                    started_at: '2024-01-01T12:00:00Z',
                },
            }

            await handleStreamOnline(payload, mockClient)

            expect(mockDMChannel.send).toBeUndefined()
        })

        test('handles channel fetch errors', async () => {
            const mockClient = {
                channels: {
                    fetch: jest.fn(),
                },
            } as any

            mockClient.channels.fetch.mockRejectedValueOnce(
                new Error('Channel not found'),
            )

            getNotificationsMock.mockResolvedValueOnce([
                { discordChannelId: 'channel-1', twitchLogin: 'user1' },
            ])

            const payload = {
                subscription: { type: 'stream.online' },
                event: {
                    id: 'event-123',
                    broadcaster_user_id: 'user-123',
                    broadcaster_user_login: 'testuser',
                    broadcaster_user_name: 'TestUser',
                    type: 'live',
                    started_at: '2024-01-01T12:00:00Z',
                },
            }

            await handleStreamOnline(payload, mockClient)

            expect(errorLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'failed to send notification',
                    ),
                }),
            )
        })

        test('gets notifications by broadcaster user ID', async () => {
            const mockClient = {
                channels: {
                    fetch: jest.fn(),
                },
            } as any

            getNotificationsMock.mockResolvedValueOnce([])

            const payload = {
                subscription: { type: 'stream.online' },
                event: {
                    id: 'event-123',
                    broadcaster_user_id: 'broadcaster-xyz',
                    broadcaster_user_login: 'testuser',
                    broadcaster_user_name: 'TestUser',
                    type: 'live',
                    started_at: '2024-01-01T12:00:00Z',
                },
            }

            await handleStreamOnline(payload, mockClient)

            expect(getNotificationsMock).toHaveBeenCalledWith('broadcaster-xyz')
        })
    })
})
