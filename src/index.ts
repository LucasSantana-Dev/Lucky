import { loadEnvironment } from "./config/environment"
import { setupErrorHandlers } from "./utils/errorHandler"
import { initializeSentry } from "./utils/monitoring"
import { initializeBot } from "./bot/start"
import { debugLog, errorLog } from "./utils/general/log"

loadEnvironment()

setupErrorHandlers()

initializeSentry()

debugLog({
    message: `Starting bot in environment: ${process.env.NODE_ENV ?? "default"}`,
})
initializeBot().catch((error) => {
    errorLog({ message: "Failed to start bot:", error })
    if (error instanceof Error) {
        errorLog({ message: "Error name:", data: error.name })
        errorLog({ message: "Error message:", data: error.message })
        errorLog({ message: "Error stack:", data: error.stack })
    }
    process.exit(1)
})
