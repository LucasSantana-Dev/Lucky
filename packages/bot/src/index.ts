import { loadEnvironment } from '@lukbot/shared/config'
import { setupErrorHandlers } from '@lukbot/shared/utils'
import { initializeSentry } from '@lukbot/shared/utils'
import { initializeBot } from './bot/start'
import { debugLog, errorLog } from '@lukbot/shared/utils'
import { dependencyCheckService } from './services/DependencyCheckService'

loadEnvironment()

setupErrorHandlers()

initializeSentry()

if (process.env.DEPENDENCY_CHECK_ENABLED === 'true') {
    dependencyCheckService.start()
}

debugLog({
    message: `Starting bot in environment: ${process.env.NODE_ENV ?? 'default'}`,
})
initializeBot().catch((error: unknown) => {
    errorLog({ message: 'Failed to start bot:', error })
    if (error instanceof Error) {
        errorLog({ message: 'Error name:', data: error.name })
        errorLog({ message: 'Error message:', data: error.message })
        errorLog({ message: 'Error stack:', data: error.stack })
    }
    process.exit(1)
})
