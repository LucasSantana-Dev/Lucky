import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// Mocks use variadic `unknown[]` signatures so the forwarding wrappers
// in vi.mock below can spread args without TS2556 narrowing them to a
// concrete tuple shape.
const initMock = vi.fn<(...args: unknown[]) => unknown>()
const captureExceptionMock = vi.fn<(...args: unknown[]) => unknown>()
const captureMessageMock = vi.fn<(...args: unknown[]) => unknown>()
const reactRouterV7IntegrationMock = vi.fn((..._args: unknown[]) => ({
    name: 'react-router-v7',
}))
const replayIntegrationMock = vi.fn((..._args: unknown[]) => ({
    name: 'replay',
}))

vi.mock('@sentry/react', () => ({
    init: (...args: unknown[]) => initMock(...args),
    captureException: (...args: unknown[]) => captureExceptionMock(...args),
    captureMessage: (...args: unknown[]) => captureMessageMock(...args),
    reactRouterV7BrowserTracingIntegration: (...args: unknown[]) =>
        reactRouterV7IntegrationMock(...args),
    replayIntegration: (...args: unknown[]) => replayIntegrationMock(...args),
}))

import { captureFrontendException, initSentry } from './sentry'

const ORIGINAL_ENV = { ...import.meta.env }

function setEnv(values: Record<string, string | undefined>) {
    for (const [k, v] of Object.entries(values)) {
        if (v === undefined) {
            delete (import.meta.env as Record<string, unknown>)[k]
        } else {
            ;(import.meta.env as Record<string, unknown>)[k] = v
        }
    }
}

describe('initSentry', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    afterEach(() => {
        // Restore env values that the test may have touched.
        for (const key of [
            'VITE_SENTRY_DSN',
            'VITE_SENTRY_ENVIRONMENT',
            'VITE_SENTRY_RELEASE',
            'VITE_SENTRY_TRACES_SAMPLE_RATE',
            'VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE',
            'VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE',
        ]) {
            const original = (ORIGINAL_ENV as Record<string, unknown>)[key]
            if (original === undefined) {
                delete (import.meta.env as Record<string, unknown>)[key]
            } else {
                ;(import.meta.env as Record<string, unknown>)[key] = original
            }
        }
    })

    test('no-ops when DSN is missing', () => {
        setEnv({ VITE_SENTRY_DSN: undefined })
        initSentry()
        expect(initMock).not.toHaveBeenCalled()
    })

    test('calls Sentry.init with the configured DSN and env', () => {
        setEnv({
            VITE_SENTRY_DSN: 'https://abc@sentry.io/123',
            VITE_SENTRY_ENVIRONMENT: 'staging',
            VITE_SENTRY_RELEASE: 'lucky@2.12.0',
        })
        initSentry()
        expect(initMock).toHaveBeenCalledTimes(1)
        const config = initMock.mock.calls[0][0] as Record<string, unknown>
        expect(config.dsn).toBe('https://abc@sentry.io/123')
        expect(config.environment).toBe('staging')
        expect(config.release).toBe('lucky@2.12.0')
    })

    test('wires the React Router v7 + replay integrations', () => {
        setEnv({ VITE_SENTRY_DSN: 'https://abc@sentry.io/123' })
        initSentry()
        expect(reactRouterV7IntegrationMock).toHaveBeenCalledTimes(1)
        expect(replayIntegrationMock).toHaveBeenCalledTimes(1)
        const config = initMock.mock.calls[0][0] as {
            integrations: Array<{ name: string }>
        }
        expect(config.integrations.map((i) => i.name)).toEqual([
            'react-router-v7',
            'replay',
        ])
    })

    test('respects custom sample rates from env', () => {
        setEnv({
            VITE_SENTRY_DSN: 'https://abc@sentry.io/123',
            VITE_SENTRY_TRACES_SAMPLE_RATE: '0.25',
            VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE: '0.5',
            VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE: '0.75',
        })
        initSentry()
        const config = initMock.mock.calls[0][0] as Record<string, number>
        expect(config.tracesSampleRate).toBeCloseTo(0.25)
        expect(config.replaysSessionSampleRate).toBeCloseTo(0.5)
        expect(config.replaysOnErrorSampleRate).toBeCloseTo(0.75)
    })

    test('falls back to default sample rates when env is missing', () => {
        setEnv({
            VITE_SENTRY_DSN: 'https://abc@sentry.io/123',
            VITE_SENTRY_TRACES_SAMPLE_RATE: undefined,
            VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE: undefined,
            VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE: undefined,
        })
        initSentry()
        const config = initMock.mock.calls[0][0] as Record<string, number>
        expect(config.tracesSampleRate).toBeCloseTo(0.1)
        expect(config.replaysSessionSampleRate).toBeCloseTo(0.1)
        expect(config.replaysOnErrorSampleRate).toBeCloseTo(1.0)
    })
})

describe('CSP violation reporting (#1283)', () => {
    function dispatchViolation(directive: string, blockedURI: string) {
        const event = new Event('securitypolicyviolation')
        Object.assign(event, {
            violatedDirective: directive,
            blockedURI,
            documentURI: 'http://localhost/',
            sourceFile: 'http://localhost/app.js',
            lineNumber: 1,
            disposition: 'report',
        })
        window.dispatchEvent(event)
    }

    beforeEach(() => {
        vi.clearAllMocks()
        setEnv({ VITE_SENTRY_DSN: 'https://abc@sentry.io/123' })
        initSentry()
    })

    test('forwards a CSP violation to Sentry as a warning', () => {
        dispatchViolation('img-src', 'https://blocked.example/a.png')

        expect(captureMessageMock).toHaveBeenCalledTimes(1)
        expect(captureMessageMock).toHaveBeenCalledWith(
            'CSP report: img-src blocked https://blocked.example/a.png',
            expect.objectContaining({
                level: 'warning',
                tags: { cspDirective: 'img-src' },
            }),
        )
    })

    test('dedupes repeated violations of the same directive+URI pair', () => {
        dispatchViolation('connect-src', 'https://blocked.example/api')
        dispatchViolation('connect-src', 'https://blocked.example/api')

        expect(captureMessageMock).toHaveBeenCalledTimes(1)
    })

    test('reports distinct directive+URI pairs separately', () => {
        dispatchViolation('style-src', 'https://blocked.example/a.css')
        dispatchViolation('style-src', 'https://blocked.example/b.css')

        expect(captureMessageMock).toHaveBeenCalledTimes(2)
    })
})

describe('captureFrontendException', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('forwards the error to Sentry without extra args by default', () => {
        const err = new Error('boom')
        captureFrontendException(err)
        expect(captureExceptionMock).toHaveBeenCalledWith(err, undefined)
    })

    test('forwards extra context when provided', () => {
        const err = new Error('boom')
        captureFrontendException(err, { guildId: '123' })
        expect(captureExceptionMock).toHaveBeenCalledWith(err, {
            extra: { guildId: '123' },
        })
    })
})
