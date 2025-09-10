import { errorLog, infoLog } from "./general/log"
import { clearAllTimers } from "./timerManager"

export function setupErrorHandlers() {
    process.on("uncaughtException", (error) => {
        errorLog({ message: "Uncaught Exception:", error })
        clearAllTimers()
        process.exit(1)
    })

    process.on("unhandledRejection", (error) => {
        errorLog({ message: "Unhandled Rejection:", error })
        clearAllTimers()
        process.exit(1)
    })

    process.on("SIGINT", () => {
        infoLog({ message: "Received SIGINT, shutting down gracefully..." })
        clearAllTimers()
        process.exit(0)
    })

    process.on("SIGTERM", () => {
        infoLog({ message: "Received SIGTERM, shutting down gracefully..." })
        clearAllTimers()
        process.exit(0)
    })
}
