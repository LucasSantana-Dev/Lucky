import { ensureEnvironment } from '@lucky/shared/config'
import { setupErrorHandlers } from '@lucky/shared/utils'
import { flushSentry, initializeSentry } from '@lucky/shared/utils'
import { initializeBot } from './bot/start'
import { debugLog, errorLog } from '@lucky/shared/utils'
import { dependencyCheckService } from './services/DependencyCheckService'

async function main(): Promise<void> {
    await ensureEnvironment()

    setupErrorHandlers()
    initializeSentry({
        appName: 'lucky',
        serviceName: 'bot',
        release: process.env.SENTRY_RELEASE,
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
    await initializeBot()
}

main().catch(async (error: unknown) => {
    errorLog({ message: 'Failed to start bot:', error })
    if (error instanceof Error) {
        errorLog({ message: 'Error name:', data: error.name })
        errorLog({ message: 'Error message:', data: error.message })
        errorLog({ message: 'Error stack:', data: error.stack })
    }
    await flushSentry(3000)
    process.exit(1)
})
