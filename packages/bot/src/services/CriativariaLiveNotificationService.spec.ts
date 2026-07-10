import {
    describe,
    test,
    expect,
    jest,
    beforeEach,
    afterEach,
} from '@jest/globals'
import type { Client, TextChannel } from 'discord.js'

jest.mock('@lucky/shared/utils', () => ({
    infoLog: jest.fn(),
    errorLog: jest.fn(),
    debugLog: jest.fn(),
    warnLog: jest.fn(),
    successLog: jest.fn(),
}))

jest.mock('../twitch/token')

import { CriativariaLiveNotificationService } from './CriativariaLiveNotificationService'
import { getTwitchUserAccessToken } from '../twitch/token'

const mockGetToken = getTwitchUserAccessToken as jest.MockedFunction<
    typeof getTwitchUserAccessToken
>

describe('CriativariaLiveNotificationService', () => {
    let service: CriativariaLiveNotificationService
    let mockClient: Partial<Client>
    let mockChannel: Partial<TextChannel>
    let mockMessage: any

    beforeEach(() => {
        mockMessage = {
            id: 'msg-123',
        }

        mockChannel = {
            send: jest.fn(async () => mockMessage),
            messages: {
                delete: jest.fn(async () => {}),
            },
        }

        mockClient = {
            channels: {
                fetch: jest.fn(async () => mockChannel),
            },
        }

        service = new CriativariaLiveNotificationService(
            () => Date.now(),
            1000,
            2000,
        )
        process.env.CRIATIVARIA_LIVES_CHANNEL_ID = 'test-channel-id'
        process.env.CRIATIVARIA_TWITCH_USER_LOGIN = 'criativaria'
        process.env.TWITCH_CLIENT_ID = 'test-client-id'
        process.env.YOUTUBE_CHANNEL_ID = 'UCxxxxxxx'
        process.env.YOUTUBE_API_KEY = 'test-youtube-key'
    })

    afterEach(() => {
        jest.clearAllMocks()
        service.stop()
    })

    describe('poll intervals (GAP 1)', () => {
        test('should use 5-min interval for Twitch polling', () => {
            const service2 = new CriativariaLiveNotificationService()
            // Access private field via any cast for test
            expect((service2 as any).twitchPollIntervalMs).toBe(5 * 60 * 1000)
        })

        test('should use 10-min interval for YouTube polling', () => {
            const service2 = new CriativariaLiveNotificationService()
            expect((service2 as any).youtubePollIntervalMs).toBe(10 * 60 * 1000)
        })
    })

    describe('YouTube polling (GAP 2)', () => {
        test('should disable YouTube polling when YOUTUBE_API_KEY absent', async () => {
            delete process.env.YOUTUBE_API_KEY
            const service2 = new CriativariaLiveNotificationService(
                () => Date.now(),
                1000,
                2000,
            )
            service2.start(mockClient as Client)

            // Wait for tick
            await new Promise((resolve) => setTimeout(resolve, 50))

            // Only Twitch should be running
            expect((service2 as any).youtubeIntervalHandle).toBeNull()
            service2.stop()
        })

        test('should detect YouTube live broadcast and post embed once', async () => {
            jest.spyOn(service, 'fetchYoutubeLiveBroadcast').mockResolvedValue({
                id: 'yt-video-1',
                title: 'Live from Criativaria',
                thumbnail: 'https://example.com/thumb.jpg',
                channelTitle: 'Criativaria',
            })

            await service.checkAndNotifyYoutube(mockClient as Client)

            expect(mockChannel.send).toHaveBeenCalledTimes(1)
            const call = (mockChannel.send as jest.Mock).mock.calls[0][0]
            expect(call.embeds[0].data.title).toContain('YouTube')
            expect(call.embeds[0].data.url).toContain('yt-video-1')
        })

        test('should not re-post same YouTube broadcast', async () => {
            jest.spyOn(service, 'fetchYoutubeLiveBroadcast').mockResolvedValue({
                id: 'yt-video-1',
                title: 'Live',
                thumbnail: 'https://example.com/thumb.jpg',
                channelTitle: 'Criativaria',
            })

            await service.checkAndNotifyYoutube(mockClient as Client)
            expect(mockChannel.send).toHaveBeenCalledTimes(1)

            await service.checkAndNotifyYoutube(mockClient as Client)
            expect(mockChannel.send).toHaveBeenCalledTimes(1)
        })

        test('should clear lastNotifiedYoutubeBroadcastId when offline', async () => {
            jest.spyOn(service, 'fetchYoutubeLiveBroadcast')
                .mockResolvedValueOnce({
                    id: 'yt-1',
                    title: 'Live',
                    thumbnail: 'https://example.com/thumb.jpg',
                    channelTitle: 'Criativaria',
                })
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce({
                    id: 'yt-2',
                    title: 'Live 2',
                    thumbnail: 'https://example.com/thumb.jpg',
                    channelTitle: 'Criativaria',
                })

            await service.checkAndNotifyYoutube(mockClient as Client)
            expect(mockChannel.send).toHaveBeenCalledTimes(1)

            await service.checkAndNotifyYoutube(mockClient as Client)

            await service.checkAndNotifyYoutube(mockClient as Client)
            expect(mockChannel.send).toHaveBeenCalledTimes(2)
        })

        test('YouTube search endpoint quota math documented in code', async () => {
            // This is a documentation test that quota math is in the code comment.
            const source = require('fs').readFileSync(
                require.resolve('./CriativariaLiveNotificationService.ts'),
                'utf8',
            )
            expect(source).toContain('14.4k units/day')
            expect(source).toContain('10k free quota')
        })
    })

    describe('message tracking & TTL cleanup (GAP 3)', () => {
        test('should track posted Twitch notification messages', async () => {
            jest.spyOn(service, 'fetchStream').mockResolvedValue({
                id: 'stream-123',
                user_login: 'criativaria',
                title: 'Live',
                viewer_count: 100,
                game_name: 'Creative',
                thumbnail_url: 'https://example.com/{width}x{height}.jpg',
                started_at: new Date().toISOString(),
            })

            await service.checkAndNotifyTwitch(mockClient as Client)

            const tracked = (service as any).postedMessages
            expect(tracked.size).toBe(1)
            expect(tracked.get('msg-123')).toEqual({
                platform: 'twitch',
                streamId: 'stream-123',
                postedAt: expect.any(Number),
            })
        })

        test('should track posted YouTube notification messages', async () => {
            jest.spyOn(service, 'fetchYoutubeLiveBroadcast').mockResolvedValue({
                id: 'yt-video-1',
                title: 'Live',
                thumbnail: 'https://example.com/thumb.jpg',
                channelTitle: 'Criativaria',
            })

            await service.checkAndNotifyYoutube(mockClient as Client)

            const tracked = (service as any).postedMessages
            expect(tracked.size).toBe(1)
            expect(tracked.get('msg-123')).toEqual({
                platform: 'youtube',
                streamId: 'yt-video-1',
                postedAt: expect.any(Number),
            })
        })

        test('should delete stale messages after 4h TTL', async () => {
            const now = Date.now()
            const mockClock = jest.fn(() => now)
            const service2 = new CriativariaLiveNotificationService(mockClock, 1000, 2000)

            // Post a message at t=0
            jest.spyOn(service2, 'fetchStream').mockResolvedValue({
                id: 'stream-1',
                user_login: 'criativaria',
                title: 'Live',
                viewer_count: 100,
                game_name: 'Creative',
                thumbnail_url: 'https://example.com/{width}x{height}.jpg',
                started_at: new Date().toISOString(),
            })

            await service2.checkAndNotifyTwitch(mockClient as Client)
            expect(mockChannel.send).toHaveBeenCalledTimes(1)

            // Advance clock to 4h + 1s
            mockClock.mockReturnValue(now + 4 * 60 * 60 * 1000 + 1000)

            // Trigger cleanup
            await service2.checkAndNotifyTwitch(mockClient as Client)
            await (service2 as any).cleanupStaleMessages(mockClient as Client)

            // Message should be deleted
            expect(
                (mockChannel.messages.delete as jest.Mock).mock.calls.length,
            ).toBeGreaterThan(0)
            service2.stop()
        })

        test('should handle message deletion errors gracefully', async () => {
            jest.spyOn(service, 'fetchStream').mockResolvedValue({
                id: 'stream-123',
                user_login: 'criativaria',
                title: 'Live',
                viewer_count: 100,
                game_name: 'Creative',
                thumbnail_url: 'https://example.com/{width}x{height}.jpg',
                started_at: new Date().toISOString(),
            })

            await service.checkAndNotifyTwitch(mockClient as Client)

            // Simulate deletion error
            const mockClock = jest.fn(() => Date.now() + 4 * 60 * 60 * 1000 + 1000)
            const service2 = new CriativariaLiveNotificationService(
                mockClock,
                1000,
                2000,
            )

            const mockChannelWithError: Partial<TextChannel> = {
                send: jest.fn(async () => mockMessage),
                messages: {
                    delete: jest.fn(async () => {
                        throw new Error('Unknown Message')
                    }),
                },
            }

            const mockClientWithError: Partial<Client> = {
                channels: {
                    fetch: jest.fn(async () => mockChannelWithError),
                },
            }

            // Manual track to avoid re-posting
            ;(service2 as any).postedMessages.set('msg-123', {
                platform: 'twitch',
                streamId: 'stream-1',
                postedAt: Date.now() - 4.1 * 60 * 60 * 1000,
            })

            // Should not throw
            await expect(
                (service2 as any).cleanupStaleMessages(
                    mockClientWithError as Client,
                ),
            ).resolves.toBeUndefined()
            service2.stop()
        })
    })

    describe('backoff & rate-limit safety (GAP 4)', () => {
        test('should retry on 429 (rate limit)', async () => {
            let attempts = 0
            global.fetch = jest.fn(async () => {
                attempts++
                if (attempts === 1) return { status: 429, headers: new Map() }
                return {
                    status: 200,
                    ok: true,
                    json: async () => ({
                        data: [{
                            id: 'stream-1',
                            user_login: 'criativaria',
                            title: 'Live',
                            viewer_count: 100,
                            game_name: 'Creative',
                            thumbnail_url: 'https://example.com/{width}x{height}.jpg',
                            started_at: new Date().toISOString(),
                        }],
                    }),
                }
            }) as any

            mockGetToken.mockResolvedValue('test-token')
            const stream = await service.fetchStream('criativaria')

            expect(attempts).toBeGreaterThan(1)
            expect(stream).not.toBeNull()
        })

        test('should retry on 5xx with backoff', async () => {
            let attempts = 0
            global.fetch = jest.fn(async () => {
                attempts++
                if (attempts <= 2) return { status: 503 }
                return {
                    status: 200,
                    ok: true,
                    json: async () => ({
                        data: [{
                            id: 'stream-1',
                            user_login: 'criativaria',
                            title: 'Live',
                            viewer_count: 100,
                            game_name: 'Creative',
                            thumbnail_url: 'https://example.com/{width}x{height}.jpg',
                            started_at: new Date().toISOString(),
                        }],
                    }),
                }
            }) as any

            mockGetToken.mockResolvedValue('test-token')
            const stream = await service.fetchStream('criativaria')

            expect(attempts).toBe(3)
            expect(stream).not.toBeNull()
        })

        test('should respect Retry-After header', async () => {
            const startTime = Date.now()
            let attempts = 0

            global.fetch = jest.fn(async () => {
                attempts++
                if (attempts === 1) {
                    return {
                        status: 429,
                        headers: new Map([['Retry-After', '1']]),
                    }
                }
                return {
                    status: 200,
                    ok: true,
                    json: async () => ({
                        data: [{
                            id: 'stream-1',
                            user_login: 'criativaria',
                            title: 'Live',
                            viewer_count: 100,
                            game_name: 'Creative',
                            thumbnail_url: 'https://example.com/{width}x{height}.jpg',
                            started_at: new Date().toISOString(),
                        }],
                    }),
                }
            }) as any

            mockGetToken.mockResolvedValue('test-token')
            const stream = await service.fetchStream('criativaria')

            const elapsed = Date.now() - startTime
            expect(elapsed).toBeGreaterThanOrEqual(900) // ~1s delay
            expect(stream).not.toBeNull()
        })
    })

    describe('existing tests (Twitch baseline)', () => {
        test('should not start when env vars are missing', async () => {
            delete process.env.CRIATIVARIA_LIVES_CHANNEL_ID
            const service2 = new CriativariaLiveNotificationService(
                () => Date.now(),
                1000,
                2000,
            )
            service2.start(mockClient as Client)
            expect(mockClient.channels.fetch).not.toHaveBeenCalled()
            service2.stop()
        })

        test('should not notify when offline (no stream returned)', async () => {
            jest.spyOn(service, 'fetchStream').mockResolvedValue(null)

            await service.checkAndNotifyTwitch(mockClient as Client)

            expect(mockChannel.send).not.toHaveBeenCalled()
        })

        test('should notify when stream is live with new stream ID', async () => {
            jest.spyOn(service, 'fetchStream').mockResolvedValue({
                id: 'stream-123',
                user_login: 'criativaria',
                title: 'Criativaria ao Vivo',
                viewer_count: 1500,
                game_name: 'Creative',
                thumbnail_url: 'https://example.com/{width}x{height}.jpg',
                started_at: new Date().toISOString(),
            })

            await service.checkAndNotifyTwitch(mockClient as Client)

            expect(mockChannel.send).toHaveBeenCalledTimes(1)
        })

        test('should not re-notify for same stream ID', async () => {
            jest.spyOn(service, 'fetchStream').mockResolvedValue({
                id: 'stream-123',
                user_login: 'criativaria',
                title: 'Criativaria ao Vivo',
                viewer_count: 1500,
                game_name: 'Creative',
                thumbnail_url: 'https://example.com/{width}x{height}.jpg',
                started_at: new Date().toISOString(),
            })

            await service.checkAndNotifyTwitch(mockClient as Client)
            expect(mockChannel.send).toHaveBeenCalledTimes(1)

            await service.checkAndNotifyTwitch(mockClient as Client)
            expect(mockChannel.send).toHaveBeenCalledTimes(1)
        })

        test('should clear lastNotifiedStreamId when stream goes offline', async () => {
            jest.spyOn(service, 'fetchStream').mockResolvedValue({
                id: 'stream-123',
                user_login: 'criativaria',
                title: 'Criativaria ao Vivo',
                viewer_count: 1500,
                game_name: 'Creative',
                thumbnail_url: 'https://example.com/{width}x{height}.jpg',
                started_at: new Date().toISOString(),
            })

            await service.checkAndNotifyTwitch(mockClient as Client)
            expect(mockChannel.send).toHaveBeenCalledTimes(1)

            jest.spyOn(service, 'fetchStream').mockResolvedValue(null)
            await service.checkAndNotifyTwitch(mockClient as Client)

            jest.spyOn(service, 'fetchStream').mockResolvedValue({
                id: 'stream-456',
                user_login: 'criativaria',
                title: 'Criativaria ao Vivo 2',
                viewer_count: 2000,
                game_name: 'Creative',
                thumbnail_url: 'https://example.com/{width}x{height}.jpg',
                started_at: new Date().toISOString(),
            })
            await service.checkAndNotifyTwitch(mockClient as Client)

            expect(mockChannel.send).toHaveBeenCalledTimes(2)
        })

        test('should handle send errors gracefully', async () => {
            jest.spyOn(service, 'fetchStream').mockResolvedValue({
                id: 'stream-123',
                user_login: 'criativaria',
                title: 'Criativaria ao Vivo',
                viewer_count: 1500,
                game_name: 'Creative',
                thumbnail_url: 'https://example.com/{width}x{height}.jpg',
                started_at: new Date().toISOString(),
            })

            jest.mocked(mockChannel.send).mockRejectedValue(
                new Error('Send failed'),
            )

            await expect(
                service.checkAndNotifyTwitch(mockClient as Client),
            ).resolves.toBeUndefined()
        })

        test('should stop the interval when stop() is called', async () => {
            service.start(mockClient as Client)

            service.stop()

            expect((service as any).twitchIntervalHandle).toBeNull()
        })

        describe('fetchStream', () => {
            beforeEach(() => {
                mockGetToken.mockResolvedValue('test-token')
            })

            test('returns null when no token', async () => {
                mockGetToken.mockResolvedValue(null)
                const result = await service.fetchStream('criativaria')
                expect(result).toBeNull()
            })

            test('returns null when TWITCH_CLIENT_ID not set', async () => {
                delete process.env.TWITCH_CLIENT_ID
                const result = await service.fetchStream('criativaria')
                expect(result).toBeNull()
            })

            test('returns null when fetch returns non-ok status', async () => {
                global.fetch = jest.fn(async () => ({ ok: false })) as any
                const result = await service.fetchStream('criativaria')
                expect(result).toBeNull()
            })

            test('returns null when fetch throws', async () => {
                global.fetch = jest.fn(async () => {
                    throw new Error('network error')
                }) as any
                const result = await service.fetchStream('criativaria')
                expect(result).toBeNull()
            })

            test('returns null when data array is empty', async () => {
                global.fetch = jest.fn(async () => ({
                    ok: true,
                    json: async () => ({ data: [] }),
                })) as any
                const result = await service.fetchStream('criativaria')
                expect(result).toBeNull()
            })

            test('returns stream when fetch succeeds', async () => {
                const stream = {
                    id: 'stream-1',
                    user_login: 'criativaria',
                    title: 'Live Test',
                    viewer_count: 100,
                    game_name: 'Gaming',
                    thumbnail_url: 'https://example.com/{width}x{height}.jpg',
                    started_at: new Date().toISOString(),
                }
                global.fetch = jest.fn(async () => ({
                    ok: true,
                    json: async () => ({ data: [stream] }),
                })) as any
                const result = await service.fetchStream('criativaria')
                expect(result).toEqual(stream)
            })
        })
    })
})
