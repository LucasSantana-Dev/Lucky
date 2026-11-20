import { ensureEnvironment } from '@lucky/shared/config'
import {
    setupErrorHandlers,
    flushSentry,
    initializeSentry,
    debugLog,
    errorLog,
    infoLog,
    sanitizeErrorMessage,
    sanitizeStack,
} from '@lucky/shared/utils'
import { initializeBot, shutdown as shutdownBot } from './bot/start'
import { dependencyCheckService } from './services/DependencyCheckService'
import { installExitDiagnostics } from './utils/monitoring/exitDiagnostics'

// First, so even an exit during startup leaves its code and cause (#3036).
const exitDiagnostics = installExitDiagnostics()

let isShuttingDown = false

async function gracefulShutdown(signal: string): Promise<void> {
    exitDiagnostics.noteSignal(signal)
    if (isShuttingDown) {
        debugLog({ message: `${signal} already in progress, ignoring` })
        return
    }

    isShuttingDown = true
    infoLog({ message: `Received ${signal}, initiating graceful shutdown...` })

    try {
        await shutdownBot()
        debugLog({ message: 'Bot shutdown completed' })
    } catch (error) {
        errorLog({ message: `Error during ${signal} shutdown:`, error })
    }

    try {
        await flushSentry(3000)
    } catch (error) {
        errorLog({ message: 'Error flushing Sentry:', error })
    }

    process.exit(0)
}

async function main(): Promise<void> {
    await ensureEnvironment()

    setupErrorHandlers()
    initializeSentry({
        appName: 'lucky',
        serviceName: 'bot',
        // || not ??: compose sets SENTRY_RELEASE to "" when unset, which is
        // not nullish and would block the COMMIT_SHA fallback (#release-empty)
        release: process.env.SENTRY_RELEASE || process.env.COMMIT_SHA,
        serverName: process.env.SENTRY_SERVER_NAME ?? process.env.HOSTNAME,
        environment: process.env.SENTRY_ENVIRONMENT,
        tags: {
            runtime: 'discord-bot',
        },
    })

    if (process.env.DEPENDENCY_CHECK_ENABLED === 'true') {
        dependencyCheckService.start()
    }

    debugLog({
        message: `Starting bot in environment: ${process.env.NODE_ENV ?? 'default'}`,
    })

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
    process.on('SIGINT', () => gracefulShutdown('SIGINT'))

    const result = await initializeBot()
    if (!result.success) {
        // Throw into main().catch (Sentry flush + exit(1)) — returning here
        // leaves a zombie process the restart policy can never revive (#1649)
        throw new Error(result.error ?? 'Bot initialization failed')
    }
}

main().catch(async (error: unknown) => {
    errorLog({ message: 'Failed to start bot:', error })
    if (error instanceof Error) {
        errorLog({ message: 'Error name:', data: error.name })
        errorLog({ message: 'Error message:', data: error.message })
        errorLog({
            message: 'Error stack (sanitized):',
            data: sanitizeStack(error) ?? sanitizeErrorMessage(error),
        })
    }

    try {
        await flushSentry(3000)
    } finally {
        process.exit(1)
    }
})
