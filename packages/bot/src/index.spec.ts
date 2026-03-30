import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals'

const ensureEnvironmentMock = jest.fn<() => Promise<void>>()
const setupErrorHandlersMock = jest.fn()
const initializeSentryMock = jest.fn()
const flushSentryMock = jest.fn<(timeout?: number) => Promise<boolean>>()
const debugLogMock = jest.fn()
const errorLogMock = jest.fn()
const initializeBotMock = jest.fn<() => Promise<void>>()
const dependencyCheckStartMock = jest.fn()

jest.mock('@lucky/shared/config', () => ({
    ensureEnvironment: (...args: unknown[]) => ensureEnvironmentMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    setupErrorHandlers: (...args: unknown[]) => setupErrorHandlersMock(...args),
    initializeSentry: (...args: unknown[]) => initializeSentryMock(...args),
    flushSentry: (...args: unknown[]) => flushSentryMock(...args),
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('./bot/start', () => ({
    initializeBot: (...args: unknown[]) => initializeBotMock(...args),
}))

jest.mock('./services/DependencyCheckService', () => ({
    dependencyCheckService: {
        start: (...args: unknown[]) => dependencyCheckStartMock(...args),
    },
}))

describe('bot entrypoint', () => {
    const originalEnv = process.env
    const originalExit = process.exit

    beforeEach(() => {
        jest.resetModules()
        jest.clearAllMocks()
        process.env = {
            ...originalEnv,
            NODE_ENV: 'production',
            SENTRY_ENVIRONMENT: 'production',
            SENTRY_RELEASE: 'lucky-bot@test-sha',
            SENTRY_SERVER_NAME: 'bot-host',
            DEPENDENCY_CHECK_ENABLED: 'false',
        }
        flushSentryMock.mockResolvedValue(true)
        ensureEnvironmentMock.mockResolvedValue()
        initializeBotMock.mockResolvedValue()
        process.exit = jest.fn() as unknown as typeof process.exit
    })

    afterEach(() => {
        process.env = originalEnv
        process.exit = originalExit
    })

    it('starts the bot with sentry metadata and optional dependency checks', async () => {
        process.env.DEPENDENCY_CHECK_ENABLED = 'true'

        await import('./index')

        expect(ensureEnvironmentMock).toHaveBeenCalled()
        expect(setupErrorHandlersMock).toHaveBeenCalled()
        expect(initializeSentryMock).toHaveBeenCalledWith({
            appName: 'lucky',
            serviceName: 'bot',
            release: 'lucky-bot@test-sha',
            serverName: 'bot-host',
            environment: 'production',
            tags: {
                runtime: 'discord-bot',
            },
        })
        expect(dependencyCheckStartMock).toHaveBeenCalled()
        expect(debugLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Starting bot in environment: production',
            }),
        )
        expect(initializeBotMock).toHaveBeenCalled()
        expect(process.exit).not.toHaveBeenCalled()
    })

    it('flushes sentry and exits when startup fails', async () => {
        const startupError = new Error('bot startup failed')
        initializeBotMock.mockRejectedValue(startupError)

        await import('./index')
        await new Promise((resolve) => setImmediate(resolve))

        expect(errorLogMock).toHaveBeenCalledWith({
            message: 'Failed to start bot:',
            error: startupError,
        })
        expect(flushSentryMock).toHaveBeenCalledWith(3000)
        expect(process.exit).toHaveBeenCalledWith(1)
    })
})
