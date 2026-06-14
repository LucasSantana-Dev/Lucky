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
    captureMessageThrottled,
    flushSentry,
    initializeSentry,
    isSentryEnabled,
    addBreadcrumb,
    monitorCommandExecution,
    monitorInteractionHandling,
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

    it('disables sentry when dsn is missing', () => {
        delete process.env.SENTRY_DSN
        expect(isSentryEnabled()).toBe(false)
    })

    it('disables sentry in development environment', () => {
        process.env.NODE_ENV = 'development'
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
            secret: 'secret-value',
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

    it('does not call sentry captureException when disabled', () => {
        process.env.SENTRY_ENABLED = 'false'
        captureException(new Error('test'))
        expect(captureExceptionMock).not.toHaveBeenCalled()
    })

    it('does not call sentry captureMessage when disabled', () => {
        process.env.SENTRY_ENABLED = 'false'
        captureMessage('test')
        expect(captureMessageMock).not.toHaveBeenCalled()
    })

    it('returns false from flushSentry when disabled', async () => {
        process.env.SENTRY_ENABLED = 'false'
        await expect(flushSentry()).resolves.toBe(false)
        expect(flushMock).not.toHaveBeenCalled()
    })

    describe('initializeSentry edge cases', () => {
        it('skips init and logs when no DSN in production', () => {
            const { infoLog } = require('../general/log') as {
                infoLog: jest.Mock
            }
            delete process.env.SENTRY_DSN
            initializeSentry({})
            expect(initMock).not.toHaveBeenCalled()
            expect(infoLog).toHaveBeenCalled()
        })

        it('skips init without logging when no DSN outside production', () => {
            const { infoLog } = require('../general/log') as {
                infoLog: jest.Mock
            }
            delete process.env.SENTRY_DSN
            process.env.NODE_ENV = 'staging'
            initializeSentry({})
            expect(initMock).not.toHaveBeenCalled()
            expect(infoLog).not.toHaveBeenCalled()
        })

        it('skips init and logs when explicitly disabled', () => {
            const { infoLog } = require('../general/log') as {
                infoLog: jest.Mock
            }
            process.env.SENTRY_ENABLED = 'false'
            initializeSentry({})
            expect(initMock).not.toHaveBeenCalled()
            expect(infoLog).toHaveBeenCalled()
        })

        it('skips init silently in development', () => {
            const { infoLog } = require('../general/log') as {
                infoLog: jest.Mock
            }
            process.env.NODE_ENV = 'development'
            initializeSentry({})
            expect(initMock).not.toHaveBeenCalled()
            expect(infoLog).not.toHaveBeenCalled()
        })

        it('uses SENTRY_ENVIRONMENT from env when not in options', () => {
            process.env.SENTRY_ENVIRONMENT = 'canary'
            initializeSentry({})
            expect(initMock).toHaveBeenCalledWith(
                expect.objectContaining({ environment: 'canary' }),
            )
        })

        it('uses env-based sample rates when options not provided', () => {
            process.env.SENTRY_TRACES_SAMPLE_RATE = '0.5'
            process.env.SENTRY_PROFILES_SAMPLE_RATE = '0.3'
            initializeSentry({})
            expect(initMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    tracesSampleRate: 0.5,
                    profilesSampleRate: 0.3,
                }),
            )
        })

        it('falls back to default sample rate when env value is NaN', () => {
            process.env.SENTRY_TRACES_SAMPLE_RATE = 'not-a-number'
            initializeSentry({})
            expect(initMock).toHaveBeenCalledWith(
                expect.objectContaining({ tracesSampleRate: 1.0 }),
            )
        })

        it('uses explicit option sample rate over env value', () => {
            process.env.SENTRY_TRACES_SAMPLE_RATE = '0.5'
            initializeSentry({ tracesSampleRate: 0.1 })
            expect(initMock).toHaveBeenCalledWith(
                expect.objectContaining({ tracesSampleRate: 0.1 }),
            )
        })

        it('uses env metadata when not provided in options', () => {
            process.env.SENTRY_APP_NAME = 'env-app'
            process.env.SENTRY_SERVICE_NAME = 'env-svc'
            process.env.SENTRY_RELEASE = 'env-release'
            process.env.SENTRY_SERVER_NAME = 'env-server'
            initializeSentry({})
            expect(initMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    release: 'env-release',
                    serverName: 'env-server',
                    initialScope: {
                        tags: { app: 'env-app', service: 'env-svc' },
                    },
                }),
            )
        })

        it('omits app and service tags when neither option nor env provides them', () => {
            initializeSentry({})
            const call = (initMock.mock.calls[0] as unknown[])[0] as {
                initialScope: { tags: Record<string, string> }
            }
            expect(call.initialScope.tags).not.toHaveProperty('app')
            expect(call.initialScope.tags).not.toHaveProperty('service')
        })

        it('sanitizes event.extra via beforeSend callback', () => {
            initializeSentry({})
            const initArg = (initMock.mock.calls[0] as unknown[])[0] as {
                beforeSend: (event: { extra?: Record<string, unknown> }) => {
                    extra?: Record<string, unknown>
                }
            }
            const result = initArg.beforeSend({
                extra: { token: 'secret', userId: 'abc' },
            })
            expect(result.extra).not.toHaveProperty('token')
            expect(result.extra).toHaveProperty('userId', 'abc')
        })

        it('beforeSend leaves extra undefined when event has no extra', () => {
            initializeSentry({})
            const initArg = (initMock.mock.calls[0] as unknown[])[0] as {
                beforeSend: (event: { extra?: unknown }) => { extra?: unknown }
            }
            const result = initArg.beforeSend({ extra: undefined })
            expect(result.extra).toBeUndefined()
        })
    })

    describe('addBreadcrumb', () => {
        it('calls sentry with all provided values', () => {
            addBreadcrumb('msg', 'cat', 'warning', { k: 'v' })
            expect(addBreadcrumbMock).toHaveBeenCalledWith({
                message: 'msg',
                category: 'cat',
                level: 'warning',
                data: { k: 'v' },
            })
        })

        it('defaults category to general and level to info', () => {
            addBreadcrumb('msg')
            expect(addBreadcrumbMock).toHaveBeenCalledWith(
                expect.objectContaining({ category: 'general', level: 'info' }),
            )
        })

        it('does not call sentry when disabled', () => {
            process.env.SENTRY_ENABLED = 'false'
            addBreadcrumb('msg')
            expect(addBreadcrumbMock).not.toHaveBeenCalled()
        })
    })

    describe('monitorCommandExecution', () => {
        it('sets command context when enabled', () => {
            monitorCommandExecution('play', 'user-1', 'guild-1')
            expect(setContextMock).toHaveBeenCalledWith('command', {
                name: 'play',
                userId: 'user-1',
                guildId: 'guild-1',
            })
        })

        it('does not set context when disabled', () => {
            process.env.SENTRY_ENABLED = 'false'
            monitorCommandExecution('play', 'user-1')
            expect(setContextMock).not.toHaveBeenCalled()
        })
    })

    describe('monitorInteractionHandling', () => {
        it('sets interaction context when enabled', () => {
            monitorInteractionHandling('button', 'user-1', 'guild-1')
            expect(setContextMock).toHaveBeenCalledWith('interaction', {
                type: 'button',
                userId: 'user-1',
                guildId: 'guild-1',
            })
        })

        it('does not set context when disabled', () => {
            process.env.SENTRY_ENABLED = 'false'
            monitorInteractionHandling('button', 'user-1')
            expect(setContextMock).not.toHaveBeenCalled()
        })
    })

    describe('captureMessageThrottled', () => {
        it('captures the first message for a key', () => {
            const captured = captureMessageThrottled(
                'test:first',
                'first',
                'warning',
            )
            expect(captured).toBe(true)
            expect(captureMessageMock).toHaveBeenCalledTimes(1)
        })

        it('throttles repeats within the window for the same key', () => {
            captureMessageThrottled('test:repeat', 'a', 'warning')
            const second = captureMessageThrottled(
                'test:repeat',
                'b',
                'warning',
            )
            expect(second).toBe(false)
            // only the first call reached sentry
            expect(captureMessageMock).toHaveBeenCalledTimes(1)
        })

        it('captures independently for distinct keys', () => {
            captureMessageThrottled('test:k1', 'a', 'warning')
            captureMessageThrottled('test:k2', 'b', 'warning')
            expect(captureMessageMock).toHaveBeenCalledTimes(2)
        })

        it('does not reach sentry and returns false when disabled', () => {
            process.env.SENTRY_ENABLED = 'false'
            const captured = captureMessageThrottled(
                'test:disabled',
                'x',
                'warning',
            )
            expect(captured).toBe(false)
            expect(captureMessageMock).not.toHaveBeenCalled()
        })

        it('does not pollute the throttle window while disabled', () => {
            // Disabled call must not consume the window: once re-enabled, the
            // first real capture for the same key must still go through.
            process.env.SENTRY_ENABLED = 'false'
            captureMessageThrottled('test:reenable', 'skipped', 'warning')
            process.env.SENTRY_ENABLED = 'true'
            const captured = captureMessageThrottled(
                'test:reenable',
                'real',
                'warning',
            )
            expect(captured).toBe(true)
            expect(captureMessageMock).toHaveBeenCalledTimes(1)
        })
    })
})
