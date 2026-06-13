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

type PublishFn = (channel: string, message: string) => Promise<number>
type SubscribeFn = (channel: string) => Promise<unknown>
type MessageListener = (channel: string, message: string) => void
type OnFn = (event: string, listener: MessageListener) => void

type PublisherMock = { status: string; publish: jest.Mock<PublishFn> }
type SubscriberMock = {
    status: string
    subscribe: jest.Mock<SubscribeFn>
    on: jest.Mock<OnFn>
}
type WithClients = {
    publisher: PublisherMock | null
    subscriber: SubscriberMock | null
}

function makePublisher(): PublisherMock {
    return { status: 'ready', publish: jest.fn<PublishFn>() }
}

function makeSubscriber(): SubscriberMock {
    return {
        status: 'ready',
        subscribe: jest.fn<SubscribeFn>(() => Promise.resolve()),
        on: jest.fn<OnFn>(),
    }
}

describe('TwitchControlService health', () => {
    it('is unhealthy before connect()', () => {
        expect(new TwitchControlService().isHealthy()).toBe(false)
    })

    it('is healthy only when both clients are ready', () => {
        const service = new TwitchControlService()
        const internals = service as unknown as WithClients

        const publisher = makePublisher()
        const subscriber = makeSubscriber()
        subscriber.status = 'reconnecting'
        internals.publisher = publisher
        internals.subscriber = subscriber
        expect(service.isHealthy()).toBe(false)

        subscriber.status = 'ready'
        expect(service.isHealthy()).toBe(true)
    })
})

describe('TwitchControlService.publishRefresh', () => {
    it('does nothing and does not throw when not connected', () => {
        const service = new TwitchControlService()
        expect(() => service.publishRefresh()).not.toThrow()
    })

    it('publishes a refresh message to the twitch channel', () => {
        const service = new TwitchControlService()
        const internals = service as unknown as WithClients
        const publisher = makePublisher()
        publisher.publish.mockResolvedValue(1)
        internals.publisher = publisher

        service.publishRefresh()

        expect(publisher.publish).toHaveBeenCalledWith(
            CHANNEL_TWITCH_REFRESH,
            'refresh',
        )
    })

    it('swallows publish rejection (fire-and-forget)', () => {
        const service = new TwitchControlService()
        const internals = service as unknown as WithClients
        const publisher = makePublisher()
        publisher.publish.mockRejectedValue(new Error('redis down'))
        internals.publisher = publisher

        expect(() => service.publishRefresh()).not.toThrow()
    })
})

describe('TwitchControlService.onRefresh', () => {
    it('does nothing when not connected', async () => {
        const service = new TwitchControlService()
        const cb = jest.fn()
        await service.onRefresh(cb)
        expect(cb).not.toHaveBeenCalled()
    })

    it('subscribes to the twitch channel and invokes cb on a matching message', async () => {
        const service = new TwitchControlService()
        const internals = service as unknown as WithClients
        const subscriber = makeSubscriber()
        let handler: MessageListener | undefined
        subscriber.on.mockImplementation((_event, listener) => {
            handler = listener
        })
        internals.subscriber = subscriber
        const cb = jest.fn()

        await service.onRefresh(cb)

        expect(subscriber.subscribe).toHaveBeenCalledWith(CHANNEL_TWITCH_REFRESH)
        handler?.(CHANNEL_TWITCH_REFRESH, 'refresh')
        expect(cb).toHaveBeenCalledTimes(1)
    })

    it('ignores messages on other channels', async () => {
        const service = new TwitchControlService()
        const internals = service as unknown as WithClients
        const subscriber = makeSubscriber()
        let handler: MessageListener | undefined
        subscriber.on.mockImplementation((_event, listener) => {
            handler = listener
        })
        internals.subscriber = subscriber
        const cb = jest.fn()

        await service.onRefresh(cb)
        handler?.('some:other:channel', 'refresh')

        expect(cb).not.toHaveBeenCalled()
    })
})
