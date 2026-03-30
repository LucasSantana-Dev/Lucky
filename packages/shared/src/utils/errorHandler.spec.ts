import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals'

const errorLogMock = jest.fn()
const infoLogMock = jest.fn()
const clearAllTimersMock = jest.fn()
const flushSentryMock = jest.fn<(timeout?: number) => Promise<boolean>>()
const handleErrorMock = jest.fn()
const createCorrelationIdMock = jest.fn(() => 'corr-123')

jest.mock('./general/log', () => ({
    errorLog: errorLogMock,
    infoLog: infoLogMock,
}))

jest.mock('./timerManager', () => ({
    clearAllTimers: clearAllTimersMock,
}))

jest.mock('./monitoring/sentry', () => ({
    flushSentry: flushSentryMock,
}))

jest.mock('./error/errorHandler', () => ({
    handleError: handleErrorMock,
    createCorrelationId: createCorrelationIdMock,
}))

import { setupErrorHandlers } from './errorHandler'

describe('setupErrorHandlers', () => {
    const originalProcessOn = process.on
    const originalProcessExit = process.exit
    const handlers = new Map<string, (...args: unknown[]) => void>()

    beforeEach(() => {
        jest.clearAllMocks()
        handlers.clear()

        flushSentryMock.mockResolvedValue(true)
        handleErrorMock.mockImplementation(() => ({
            metadata: { correlationId: 'corr-123' },
        }))

        process.on = jest.fn(
            (event: string, handler: (...args: unknown[]) => void) => {
                handlers.set(event, handler)
                return process
            },
        ) as typeof process.on

        process.exit = jest.fn() as unknown as typeof process.exit
    })

    afterEach(() => {
        process.on = originalProcessOn
        process.exit = originalProcessExit
    })

    it('flushes sentry before exiting on uncaught exceptions', async () => {
        setupErrorHandlers()

        handlers.get('uncaughtException')?.(new Error('boom'))
        await new Promise((resolve) => setImmediate(resolve))

        expect(handleErrorMock).toHaveBeenCalled()
        expect(errorLogMock).toHaveBeenCalled()
        expect(clearAllTimersMock).toHaveBeenCalled()
        expect(flushSentryMock).toHaveBeenCalledWith(3000)
        expect(process.exit).toHaveBeenCalledWith(1)
    })

    it('flushes sentry before exiting on graceful shutdown signals', async () => {
        setupErrorHandlers()

        handlers.get('SIGTERM')?.()
        await new Promise((resolve) => setImmediate(resolve))

        expect(infoLogMock).toHaveBeenCalled()
        expect(clearAllTimersMock).toHaveBeenCalled()
        expect(flushSentryMock).toHaveBeenCalledWith(3000)
        expect(process.exit).toHaveBeenCalledWith(0)
    })
})
