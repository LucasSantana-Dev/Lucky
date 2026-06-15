import { describe, expect, it, jest, beforeEach } from '@jest/globals'

jest.mock('../../utils/general/log.js', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    infoLog: jest.fn(),
}))

jest.mock('../redis/config.js', () => ({
    createRedisConfig: jest.fn(() => ({})),
}))

jest.mock('ioredis', () => ({
    __esModule: true,
    default: jest.fn(),
}))

jest.mock('../../utils/monitoring/sentry.js', () => ({
    captureMessageThrottled: jest.fn(),
}))

import { debugLog, errorLog, infoLog } from '../../utils/general/log.js'
import { createRedisConfig } from '../redis/config.js'
import { captureMessageThrottled } from '../../utils/monitoring/sentry.js'
import RedisClientClass from 'ioredis'
import {
    TwitchControlService,
    CHANNEL_TWITCH_REFRESH,
} from './TwitchControlService.js'

// The internal ioredis clients are hand-built mocks; cast to a loose record so
// the jest.fn() signatures don't have to satisfy ioredis's typed overloads.
type WithClients = {
    publisher: Record<string, any> | null
    subscriber: Record<string, any> | null
}

const mockDebugLog = debugLog as any
const mockErrorLog = errorLog as any
const mockInfoLog = infoLog as any
const mockCreateRedisConfig = createRedisConfig as any
const mockRedisClientClass = RedisClientClass as any
const mockCaptureMessageThrottled = captureMessageThrottled as any

describe('TwitchControlService', () => {
    let mockRedisClient: Record<string, any>

    beforeEach(() => {
        jest.clearAllMocks()

        mockRedisClient = {
            status: 'ready',
            connect: jest.fn(async () => {}),
            disconnect: jest.fn(async () => {}),
            unsubscribe: jest.fn(async () => {}),
            publish: jest.fn(async () => 1),
            subscribe: jest.fn(async () => {}),
            on: jest.fn(),
        } as any

        mockRedisClientClass.mockImplementation(() => mockRedisClient)
        mockCreateRedisConfig.mockReturnValue({})
    })

    describe('CHANNEL_TWITCH_REFRESH constant', () => {
        it('exports the correct refresh channel name', () => {
            expect(CHANNEL_TWITCH_REFRESH).toBe('twitch:refresh')
        })
    })

    describe('isHealthy', () => {
        it('returns false before connect()', () => {
            const service = new TwitchControlService()
            expect(service.isHealthy()).toBe(false)
        })

        it('returns false when publisher is not ready', () => {
            const service = new TwitchControlService()
            const internals = service as unknown as WithClients

            internals.publisher = { status: 'connecting' }
            internals.subscriber = { status: 'ready' }

            expect(service.isHealthy()).toBe(false)
        })

        it('returns false when subscriber is not ready', () => {
            const service = new TwitchControlService()
            const internals = service as unknown as WithClients

            internals.publisher = { status: 'ready' }
            internals.subscriber = { status: 'reconnecting' }

            expect(service.isHealthy()).toBe(false)
        })

        it('returns true only when both clients are ready', () => {
            const service = new TwitchControlService()
            const internals = service as unknown as WithClients

            internals.publisher = { status: 'ready' }
            internals.subscriber = { status: 'ready' }

            expect(service.isHealthy()).toBe(true)
        })

        it('returns false when publisher is null', () => {
            const service = new TwitchControlService()
            const internals = service as unknown as WithClients

            internals.publisher = null
            internals.subscriber = { status: 'ready' }

            expect(service.isHealthy()).toBe(false)
        })

        it('returns false when subscriber is null', () => {
            const service = new TwitchControlService()
            const internals = service as unknown as WithClients

            internals.publisher = { status: 'ready' }
            internals.subscriber = null

            expect(service.isHealthy()).toBe(false)
        })
    })

    describe('connect', () => {
        it('creates two Redis clients and connects both', async () => {
            const service = new TwitchControlService()
            await service.connect()

            expect(mockRedisClientClass).toHaveBeenCalledTimes(2)
            expect(mockRedisClientClass).toHaveBeenCalledWith({})
            expect(mockRedisClient.connect).toHaveBeenCalledTimes(2)
        })

        it('logs success message on successful connection', async () => {
            const service = new TwitchControlService()
            await service.connect()

            expect(mockInfoLog).toHaveBeenCalledWith({
                message: 'TwitchControlService connected to Redis',
            })
        })

        it('logs error and continues on connection failure', async () => {
            const connectError = new Error('Connection failed')
            mockRedisClient.connect.mockRejectedValueOnce(connectError)

            const service = new TwitchControlService()
            await service.connect()

            expect(mockErrorLog).toHaveBeenCalledWith({
                message: 'TwitchControlService failed to connect:',
                error: connectError,
            })
        })
    })

    describe('disconnect', () => {
        it('unsubscribes and disconnects subscriber, then disconnects publisher', async () => {
            const service = new TwitchControlService()
            const internals = service as unknown as WithClients

            internals.subscriber = mockRedisClient
            internals.publisher = mockRedisClient

            await service.disconnect()

            expect(mockRedisClient.unsubscribe).toHaveBeenCalled()
            expect(mockRedisClient.disconnect).toHaveBeenCalledTimes(2)
        })

        it('handles null subscriber gracefully', async () => {
            const service = new TwitchControlService()
            const internals = service as unknown as WithClients

            internals.subscriber = null
            internals.publisher = mockRedisClient

            await service.disconnect()

            expect(mockRedisClient.disconnect).toHaveBeenCalledTimes(1)
        })

        it('handles null publisher gracefully', async () => {
            const service = new TwitchControlService()
            const internals = service as unknown as WithClients

            const mockSubscriber = {
                unsubscribe: jest.fn(async () => {}),
                disconnect: jest.fn(async () => {}),
            } as any

            internals.subscriber = mockSubscriber
            internals.publisher = null

            await service.disconnect()

            expect(mockSubscriber.unsubscribe).toHaveBeenCalled()
            expect(mockSubscriber.disconnect).toHaveBeenCalledTimes(1)
            // Verify no error was logged (would happen if we tried to call disconnect on null)
            expect(mockErrorLog).not.toHaveBeenCalled()
        })

        it('only disconnects publisher when publisher is not null', async () => {
            const service = new TwitchControlService()
            const internals = service as unknown as WithClients

            const mockPublisher = {
                disconnect: jest.fn(async () => {}),
            } as any

            internals.subscriber = null
            internals.publisher = mockPublisher

            await service.disconnect()

            expect(mockPublisher.disconnect).toHaveBeenCalledTimes(1)
        })

        it('verifies publisher null-check by comparing null vs non-null disconnect calls', async () => {
            const service1 = new TwitchControlService()
            const service2 = new TwitchControlService()

            const internals1 = service1 as unknown as WithClients
            const internals2 = service2 as unknown as WithClients

            const mockPublisher = {
                disconnect: jest.fn(async () => {}),
            } as any

            // Service 1: publisher is null
            internals1.subscriber = null
            internals1.publisher = null

            // Service 2: publisher is not null
            internals2.subscriber = null
            internals2.publisher = mockPublisher

            await service1.disconnect()
            await service2.disconnect()

            // Service 2 should have called disconnect, service 1 should not
            expect(mockPublisher.disconnect).toHaveBeenCalledTimes(1)
        })

        it('logs disconnect success message', async () => {
            const service = new TwitchControlService()
            const internals = service as unknown as WithClients

            internals.subscriber = mockRedisClient
            internals.publisher = mockRedisClient

            await service.disconnect()

            expect(mockDebugLog).toHaveBeenCalledWith({
                message: 'TwitchControlService disconnected',
            })
        })

        it('logs error on disconnect failure', async () => {
            const disconnectError = new Error('Disconnect failed')
            mockRedisClient.disconnect.mockRejectedValueOnce(disconnectError)

            const service = new TwitchControlService()
            const internals = service as unknown as WithClients

            internals.subscriber = mockRedisClient
            internals.publisher = mockRedisClient

            await service.disconnect()

            expect(mockErrorLog).toHaveBeenCalledWith({
                message: 'TwitchControlService disconnect error:',
                error: disconnectError,
            })
        })
    })

    describe('publishRefresh', () => {
        it('skips publish and logs when publisher is not ready', async () => {
            const service = new TwitchControlService()
            const internals = service as unknown as WithClients

            internals.publisher = { status: 'connecting' }

            await service.publishRefresh()

            expect(mockRedisClient.publish).not.toHaveBeenCalled()
            expect(mockDebugLog).toHaveBeenCalledWith({
                message:
                    'TwitchControlService: skipping refresh publish (Redis not ready)',
            })
        })

        it('skips publish and logs warning when publisher is null', async () => {
            const service = new TwitchControlService()
            const internals = service as unknown as WithClients

            internals.publisher = null

            await service.publishRefresh()

            expect(mockDebugLog).toHaveBeenCalledWith({
                message:
                    'TwitchControlService: skipping refresh publish (Redis not ready)',
            })
        })

        it('publishes to the refresh channel when publisher is ready', async () => {
            const service = new TwitchControlService()
            const internals = service as unknown as WithClients

            internals.publisher = mockRedisClient

            await service.publishRefresh()

            expect(mockRedisClient.publish).toHaveBeenCalledWith(
                CHANNEL_TWITCH_REFRESH,
                '1',
            )
        })

        it('publishes regardless of subscriber status (publisher-only gate)', async () => {
            const service = new TwitchControlService()
            const internals = service as unknown as WithClients

            internals.publisher = mockRedisClient
            internals.subscriber = { status: 'reconnecting' }

            await service.publishRefresh()

            expect(mockRedisClient.publish).toHaveBeenCalledWith(
                CHANNEL_TWITCH_REFRESH,
                '1',
            )
        })

        it('logs error when publish fails', async () => {
            const publishError = new Error('Publish failed')
            mockRedisClient.publish.mockRejectedValueOnce(publishError)

            const service = new TwitchControlService()
            const internals = service as unknown as WithClients

            internals.publisher = mockRedisClient

            await service.publishRefresh()

            expect(mockErrorLog).toHaveBeenCalledWith({
                message: 'TwitchControlService: refresh publish failed',
                error: publishError,
            })
        })

        it('captures Sentry message when publish is skipped due to Redis not being ready', async () => {
            const service = new TwitchControlService()
            const internals = service as unknown as WithClients

            internals.publisher = { status: 'connecting' }

            await service.publishRefresh()

            expect(mockCaptureMessageThrottled).toHaveBeenCalledWith(
                'twitch:refresh:skip',
                'TwitchControlService: refresh publish skipped — Redis not ready; bot sync delayed until reconnect/restart',
                'warning',
            )
        })

        it('captures Sentry message when publish fails with error details', async () => {
            const publishError = new Error('Network error')
            mockRedisClient.publish.mockRejectedValueOnce(publishError)

            const service = new TwitchControlService()
            const internals = service as unknown as WithClients

            internals.publisher = mockRedisClient

            await service.publishRefresh()

            expect(mockCaptureMessageThrottled).toHaveBeenCalledWith(
                'twitch:refresh:fail',
                'TwitchControlService: refresh publish failed',
                'warning',
                {
                    reason: 'Network error',
                },
            )
        })
    })

    describe('subscribeToRefresh', () => {
        it('subscribes to the refresh channel', async () => {
            const service = new TwitchControlService()
            const internals = service as unknown as WithClients

            internals.subscriber = mockRedisClient

            const handler = jest.fn(async () => {}) as any
            await service.subscribeToRefresh(handler)

            expect(mockRedisClient.subscribe).toHaveBeenCalledWith(
                CHANNEL_TWITCH_REFRESH,
            )
        })

        it('registers a message event handler', async () => {
            const service = new TwitchControlService()
            const internals = service as unknown as WithClients

            internals.subscriber = mockRedisClient

            const handler = jest.fn(async () => {}) as any
            await service.subscribeToRefresh(handler)

            expect(mockRedisClient.on).toHaveBeenCalledWith(
                'message',
                expect.any(Function),
            )
        })

        it('calls handler only for refresh channel messages', async () => {
            const service = new TwitchControlService()
            const internals = service as unknown as WithClients

            let messageHandler = (_ch: any) => {}
            mockRedisClient.on.mockImplementation((_event: any, cb: any) => {
                messageHandler = cb
            })

            internals.subscriber = mockRedisClient

            const handler = jest.fn(async () => {}) as any
            await service.subscribeToRefresh(handler)

            messageHandler('some:other:channel')
            expect(handler).not.toHaveBeenCalled()

            messageHandler(CHANNEL_TWITCH_REFRESH)
            expect(handler).toHaveBeenCalledTimes(1)
        })

        it('logs and swallows handler errors', async () => {
            const service = new TwitchControlService()
            const internals = service as unknown as WithClients

            let messageHandler = (_ch: any) => {}
            mockRedisClient.on.mockImplementation((_event: any, cb: any) => {
                messageHandler = cb
            })

            internals.subscriber = mockRedisClient

            const handlerError = new Error('Handler failed')
            const handler = jest.fn(async () => {
                throw handlerError
            }) as any
            await service.subscribeToRefresh(handler)

            await messageHandler(CHANNEL_TWITCH_REFRESH)

            expect(mockErrorLog).toHaveBeenCalledWith({
                message: 'TwitchControlService: refresh handler failed',
                error: handlerError,
            })
        })

        it('does not crash when subscriber is null', async () => {
            const service = new TwitchControlService()
            const internals = service as unknown as WithClients

            internals.subscriber = null

            const handler = jest.fn(async () => {}) as any
            await service.subscribeToRefresh(handler)

            expect(handler).not.toHaveBeenCalled()
        })

        it('logs subscription success message', async () => {
            const service = new TwitchControlService()
            const internals = service as unknown as WithClients

            internals.subscriber = mockRedisClient

            const handler = jest.fn(async () => {}) as any
            await service.subscribeToRefresh(handler)

            expect(mockInfoLog).toHaveBeenCalledWith({
                message: 'Subscribed to Twitch refresh signals',
            })
        })

        it('calls handler multiple times for multiple messages', async () => {
            const service = new TwitchControlService()
            const internals = service as unknown as WithClients

            let messageHandler = (_ch: any) => {}
            mockRedisClient.on.mockImplementation((_event: any, cb: any) => {
                messageHandler = cb
            })

            internals.subscriber = mockRedisClient

            const handler = jest.fn(async () => {}) as any
            await service.subscribeToRefresh(handler)

            messageHandler(CHANNEL_TWITCH_REFRESH)
            messageHandler(CHANNEL_TWITCH_REFRESH)
            messageHandler(CHANNEL_TWITCH_REFRESH)

            expect(handler).toHaveBeenCalledTimes(3)
        })
    })
})
