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

    it('handles SIGTERM signal for graceful shutdown', async () => {
        const shutdownBotMock = jest.fn<() => Promise<void>>()
        jest.mock('./bot/start', () => ({
            initializeBot: (...args: unknown[]) => initializeBotMock(...args),
            shutdown: (...args: unknown[]) => shutdownBotMock(...args),
        }))

        let sigTermHandler: (() => void) | null = null
        const originalOn = process.on
        process.on = jest.fn((signal: string, handler: any) => {
            if (signal === 'SIGTERM') {
                sigTermHandler = handler
            }
            return process as any
        })

        await import('./index')

        expect(sigTermHandler).not.toBeNull()
        if (sigTermHandler) {
            sigTermHandler()
            await new Promise((resolve) => setImmediate(resolve))
        }

        expect(debugLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('Received SIGTERM'),
            })
        )

        process.on = originalOn
    })

    it('handles SIGINT signal for graceful shutdown', async () => {
        const shutdownBotMock = jest.fn<() => Promise<void>>()
        jest.mock('./bot/start', () => ({
            initializeBot: (...args: unknown[]) => initializeBotMock(...args),
            shutdown: (...args: unknown[]) => shutdownBotMock(...args),
        }))

        let sigIntHandler: (() => void) | null = null
        const originalOn = process.on
        process.on = jest.fn((signal: string, handler: any) => {
            if (signal === 'SIGINT') {
                sigIntHandler = handler
            }
            return process as any
        })

        await import('./index')

        expect(sigIntHandler).not.toBeNull()
        if (sigIntHandler) {
            sigIntHandler()
            await new Promise((resolve) => setImmediate(resolve))
        }

        expect(debugLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('Received SIGINT'),
            })
        )

        process.on = originalOn
    })

    it('prevents concurrent shutdown operations', async () => {
        const shutdownBotMock = jest.fn<() => Promise<void>>()
        shutdownBotMock.mockResolvedValue()

        jest.mock('./bot/start', () => ({
            initializeBot: (...args: unknown[]) => initializeBotMock(...args),
            shutdown: (...args: unknown[]) => shutdownBotMock(...args),
        }))

        let sigTermHandler: (() => void) | null = null
        const originalOn = process.on
        process.on = jest.fn((signal: string, handler: any) => {
            if (signal === 'SIGTERM') {
                sigTermHandler = handler
            }
            return process as any
        })

        await import('./index')

        if (sigTermHandler) {
            sigTermHandler()
            sigTermHandler()
            await new Promise((resolve) => setImmediate(resolve))
        }

        expect(debugLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('already in progress'),
            })
        )

        process.on = originalOn
    })

    it('flushes sentry on shutdown', async () => {
        const shutdownBotMock = jest.fn<() => Promise<void>>()
        shutdownBotMock.mockResolvedValue()

        jest.mock('./bot/start', () => ({
            initializeBot: (...args: unknown[]) => initializeBotMock(...args),
            shutdown: (...args: unknown[]) => shutdownBotMock(...args),
        }))

        let sigTermHandler: (() => void) | null = null
        const originalOn = process.on
        process.on = jest.fn((signal: string, handler: any) => {
            if (signal === 'SIGTERM') {
                sigTermHandler = handler
            }
            return process as any
        })

        await import('./index')

        if (sigTermHandler) {
            sigTermHandler()
            await new Promise((resolve) => setImmediate(resolve))
        }

        expect(flushSentryMock).toHaveBeenCalledWith(3000)
        expect(process.exit).toHaveBeenCalledWith(0)

        process.on = originalOn
    })

    it('exits with code 0 after successful shutdown', async () => {
        const shutdownBotMock = jest.fn<() => Promise<void>>()
        shutdownBotMock.mockResolvedValue()

        jest.mock('./bot/start', () => ({
            initializeBot: (...args: unknown[]) => initializeBotMock(...args),
            shutdown: (...args: unknown[]) => shutdownBotMock(...args),
        }))

        let sigTermHandler: (() => void) | null = null
        const originalOn = process.on
        process.on = jest.fn((signal: string, handler: any) => {
            if (signal === 'SIGTERM') {
                sigTermHandler = handler
            }
            return process as any
        })

        await import('./index')

        if (sigTermHandler) {
            sigTermHandler()
            await new Promise((resolve) => setImmediate(resolve))
        }

        expect(process.exit).toHaveBeenCalledWith(0)

        process.on = originalOn
    })

    it('handles error during shutdown gracefully', async () => {
        const shutdownBotMock = jest.fn<() => Promise<void>>()
        const shutdownError = new Error('shutdown failed')
        shutdownBotMock.mockRejectedValue(shutdownError)

        jest.mock('./bot/start', () => ({
            initializeBot: (...args: unknown[]) => initializeBotMock(...args),
            shutdown: (...args: unknown[]) => shutdownBotMock(...args),
        }))

        let sigTermHandler: (() => void) | null = null
        const originalOn = process.on
        process.on = jest.fn((signal: string, handler: any) => {
            if (signal === 'SIGTERM') {
                sigTermHandler = handler
            }
            return process as any
        })

        await import('./index')

        if (sigTermHandler) {
            sigTermHandler()
            await new Promise((resolve) => setImmediate(resolve))
        }

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('Error during'),
            })
        )

        process.on = originalOn
    })
})
