import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals'

const captureExceptionMock = jest.fn()
const captureMessageMock = jest.fn()
const initMock = jest.fn()
const flushMock = jest.fn<(timeout?: number) => Promise<boolean>>()
const addBreadcrumbMock = jest.fn()
const setContextMock = jest.fn()

jest.mock('@sentry/node', () => ({
    captureException: captureExceptionMock,
    captureMessage: captureMessageMock,
    init: initMock,
    flush: flushMock,
    addBreadcrumb: addBreadcrumbMock,
    setContext: setContextMock,
}))

jest.mock('../general/log', () => ({
    infoLog: jest.fn(),
}))

import {
    captureException,
    captureMessage,
    flushSentry,
    initializeSentry,
    isSentryEnabled,
} from './sentry'

describe('sentry monitoring', () => {
    const originalEnv = process.env

    beforeEach(() => {
        jest.clearAllMocks()
        process.env = {
            ...originalEnv,
            NODE_ENV: 'production',
            SENTRY_DSN: 'https://example@sentry.io/123',
        }
        flushMock.mockResolvedValue(true)
    })

    afterAll(() => {
        process.env = originalEnv
    })

    it('enables sentry when dsn is configured outside development', () => {
        expect(isSentryEnabled()).toBe(true)
    })

    it('disables sentry when explicitly turned off', () => {
        process.env.SENTRY_ENABLED = 'false'

        expect(isSentryEnabled()).toBe(false)
    })

    it('initializes sentry with service metadata and overrides', () => {
        initializeSentry({
            appName: 'lucky',
            serviceName: 'bot',
            release: '1.2.3',
            serverName: 'bot-01',
            environment: 'staging',
            tags: { runtime: 'discord-bot' },
        })

        expect(initMock).toHaveBeenCalledWith(
            expect.objectContaining({
                dsn: 'https://example@sentry.io/123',
                environment: 'staging',
                release: '1.2.3',
                serverName: 'bot-01',
                initialScope: {
                    tags: {
                        app: 'lucky',
                        service: 'bot',
                        runtime: 'discord-bot',
                    },
                },
            }),
        )
    })

    it('sanitizes sensitive extras before capturing exceptions and messages', () => {
        captureException(new Error('boom'), {
            token: 'secret-token',
            correlationId: 'abc',
        })
        captureMessage('hello', 'info', {
            password: 'secret-password',
            guildId: 'guild-1',
        })

        expect(captureExceptionMock).toHaveBeenCalledWith(expect.any(Error), {
            extra: { correlationId: 'abc' },
        })
        expect(captureMessageMock).toHaveBeenCalledWith('hello', {
            level: 'info',
            extra: { guildId: 'guild-1' },
        })
    })

    it('flushes pending events when sentry is enabled', async () => {
        await expect(flushSentry(1234)).resolves.toBe(true)
        expect(flushMock).toHaveBeenCalledWith(1234)
    })
})
