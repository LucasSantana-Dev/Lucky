import { loadEnvironment } from './config/environment'
import { setupErrorHandlers } from './utils/errorHandler'
import { initializeSentry } from './utils/monitoring'
import { initializeBot } from './bot/start'
import { debugLog, errorLog } from './utils/general/log'
import { startWebApp } from './webapp/server'
import { dependencyCheckService } from './services/DependencyCheckService'

loadEnvironment()

setupErrorHandlers()

initializeSentry()

if (process.env.WEBAPP_ENABLED === 'true') {
    startWebApp()
}

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
