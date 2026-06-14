import { describe, expect, it, jest } from '@jest/globals'

jest.mock('../../utils/general/log.js', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    infoLog: jest.fn(),
}))

jest.mock('ioredis', () => ({
    __esModule: true,
    default: jest.fn(),
}))

import {
    TwitchControlService,
    CHANNEL_TWITCH_REFRESH,
} from './TwitchControlService.js'

// The internal ioredis clients are hand-built mocks; cast to a loose record so
// the jest.fn() signatures don't have to satisfy ioredis's typed overloads.
type WithClients = {
    publisher: Record<string, unknown> | null
    subscriber: Record<string, unknown> | null
}

describe('TwitchControlService', () => {
    it('is unhealthy before connect()', () => {
        const service = new TwitchControlService()
        expect(service.isHealthy()).toBe(false)
    })

    it('is healthy only when both clients are ready', () => {
        const service = new TwitchControlService()
        const internals = service as unknown as WithClients

        internals.publisher = { status: 'ready', publish: jest.fn() }
        internals.subscriber = {
            status: 'reconnecting',
            subscribe: jest.fn(),
            on: jest.fn(),
        }
        expect(service.isHealthy()).toBe(false)

        internals.subscriber.status = 'ready'
        expect(service.isHealthy()).toBe(true)
    })

    it('publishRefresh no-ops when Redis is not ready', async () => {
        const service = new TwitchControlService()
        const internals = service as unknown as WithClients
        const publish = jest.fn()
        internals.publisher = { status: 'connecting', publish }
        internals.subscriber = {
            status: 'connecting',
            subscribe: jest.fn(),
            on: jest.fn(),
        }

        await service.publishRefresh()

        expect(publish).not.toHaveBeenCalled()
    })

    it('publishRefresh publishes to the refresh channel when healthy', async () => {
        const service = new TwitchControlService()
        const internals = service as unknown as WithClients
        const publish = jest.fn((..._a: unknown[]) => Promise.resolve(1))
        internals.publisher = { status: 'ready', publish }
        internals.subscriber = {
            status: 'ready',
            subscribe: jest.fn(),
            on: jest.fn(),
        }

        await service.publishRefresh()

        expect(publish).toHaveBeenCalledWith(CHANNEL_TWITCH_REFRESH, '1')
    })

    it('subscribeToRefresh runs the handler only for the refresh channel', async () => {
        const service = new TwitchControlService()
        const internals = service as unknown as WithClients
        let messageHandler: (ch: string) => Promise<void> = async () => {}
        const subscribe = jest.fn((..._a: unknown[]) => Promise.resolve())
        const on = jest.fn((..._a: unknown[]) => {
            messageHandler = _a[1] as (ch: string) => Promise<void>
        })
        internals.subscriber = { status: 'ready', subscribe, on }
        internals.publisher = { status: 'ready', publish: jest.fn() }

        const handler = jest.fn((..._a: unknown[]) => Promise.resolve())
        await service.subscribeToRefresh(handler)

        expect(subscribe).toHaveBeenCalledWith(CHANNEL_TWITCH_REFRESH)

        await messageHandler('some:other:channel')
        expect(handler).not.toHaveBeenCalled()

        await messageHandler(CHANNEL_TWITCH_REFRESH)
        expect(handler).toHaveBeenCalledTimes(1)
    })
})
