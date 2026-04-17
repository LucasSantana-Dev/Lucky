import { ensureEnvironment } from '@lucky/shared/config'
import { setupErrorHandlers } from '@lucky/shared/utils'
import { flushSentry, initializeSentry } from '@lucky/shared/utils'
import { initializeBot, shutdown as shutdownBot } from './bot/start'
import { debugLog, errorLog } from '@lucky/shared/utils'
import { dependencyCheckService } from './services/DependencyCheckService'

let isShuttingDown = false

async function gracefulShutdown(signal: string): Promise<void> {
    if (isShuttingDown) {
        debugLog({ message: `${signal} already in progress, ignoring` })
        return
    }

    isShuttingDown = true
    debugLog({ message: `Received ${signal}, initiating graceful shutdown...` })

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
        release: process.env.SENTRY_RELEASE ?? process.env.COMMIT_SHA,
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

    await initializeBot()
}

main().catch(async (error: unknown) => {
    errorLog({ message: 'Failed to start bot:', error })
    if (error instanceof Error) {
        errorLog({ message: 'Error name:', data: error.name })
        errorLog({ message: 'Error message:', data: error.message })
        errorLog({ message: 'Error stack:', data: error.stack })
    }

    try {
        await flushSentry(3000)
    } finally {
        process.exit(1)
    }
})
