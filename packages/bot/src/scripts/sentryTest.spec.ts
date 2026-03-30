import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals'

const captureMessageMock = jest.fn()
const flushSentryMock = jest.fn<(timeout?: number) => Promise<boolean>>()
const initializeSentryMock = jest.fn()
const isSentryEnabledMock = jest.fn<() => boolean>()
const consoleLogMock = jest.fn()
const consoleErrorMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    captureMessage: (...args: unknown[]) => captureMessageMock(...args),
    flushSentry: (...args: unknown[]) => flushSentryMock(...args),
    initializeSentry: (...args: unknown[]) => initializeSentryMock(...args),
    isSentryEnabled: (...args: unknown[]) => isSentryEnabledMock(...args),
}))

describe('sentry test script', () => {
    const originalEnv = process.env
    const originalExit = process.exit
    const originalConsoleLog = console.log
    const originalConsoleError = console.error

    beforeEach(() => {
        jest.resetModules()
        jest.clearAllMocks()
        process.env = {
            ...originalEnv,
            SENTRY_ENVIRONMENT: 'production',
            SENTRY_SERVICE_NAME: 'bot',
            SENTRY_APP_NAME: 'lucky',
            SENTRY_SERVER_NAME: 'bot-host',
            SENTRY_RELEASE: 'lucky-bot@test-sha',
        }
        flushSentryMock.mockResolvedValue(true)
        isSentryEnabledMock.mockReturnValue(true)
        console.log = consoleLogMock
        console.error = consoleErrorMock
        process.exit = jest.fn() as unknown as typeof process.exit
    })

    afterEach(() => {
        process.env = originalEnv
        process.exit = originalExit
        console.log = originalConsoleLog
        console.error = originalConsoleError
    })

    it('initializes sentry and sends a manual verification event', async () => {
        const { runSentryTest } = await import('./sentryTest')
        await runSentryTest()

        expect(initializeSentryMock).toHaveBeenCalledWith({
            appName: 'lucky',
            serviceName: 'bot',
            release: 'lucky-bot@test-sha',
            serverName: 'bot-host',
            environment: 'production',
            tags: {
                runtime: 'discord-bot',
                trigger: 'manual-sentry-test',
            },
        })
        expect(captureMessageMock).toHaveBeenCalledWith(
            'Lucky bot manual Sentry verification event',
            'warning',
            expect.objectContaining({
                eventType: 'manual-sentry-test',
                service: 'bot',
                environment: 'production',
                timestamp: expect.any(String),
            }),
        )
        expect(flushSentryMock).toHaveBeenCalledWith(5000)
        expect(consoleLogMock).toHaveBeenCalledWith(
            expect.stringContaining('Sentry test event queued successfully at'),
        )
        expect(process.exit).not.toHaveBeenCalled()
    })

    it('exits with an error when sentry is disabled', async () => {
        isSentryEnabledMock.mockReturnValue(false)

        const { runSentryTest, handleSentryTestFailure } =
            await import('./sentryTest')
        await expect(runSentryTest()).rejects.toThrow('Sentry is not enabled.')
        handleSentryTestFailure(
            new Error(
                'Sentry is not enabled. Set SENTRY_DSN and a non-development environment before running sentry:test.',
            ),
        )

        expect(captureMessageMock).not.toHaveBeenCalled()
        expect(consoleErrorMock).toHaveBeenCalledWith(
            expect.stringContaining(
                'Sentry test failed: Sentry is not enabled.',
            ),
        )
        expect(process.exit).toHaveBeenCalledWith(1)
    })

    it('exits with an error when flush does not complete', async () => {
        flushSentryMock.mockResolvedValue(false)

        const { runSentryTest, handleSentryTestFailure } =
            await import('./sentryTest')
        await expect(runSentryTest()).rejects.toThrow('Sentry did not flush')
        handleSentryTestFailure(
            new Error(
                'Sentry did not flush the manual verification event within 5000ms.',
            ),
        )

        expect(consoleErrorMock).toHaveBeenCalledWith(
            expect.stringContaining('Sentry test failed: Sentry did not flush'),
        )
        expect(process.exit).toHaveBeenCalledWith(1)
    })
})
