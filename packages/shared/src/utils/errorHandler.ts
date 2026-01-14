import { errorLog, infoLog } from './general/log'
import { clearAllTimers } from './timerManager'
import { handleError, createCorrelationId } from './error/errorHandler'

export function setupErrorHandlers() {
    process.on('uncaughtException', (error) => {
        const structuredError = handleError(error, {
            correlationId: createCorrelationId(),
        })

        errorLog({
            message: 'Uncaught Exception - Application will exit',
            error: structuredError,
            correlationId: structuredError.metadata.correlationId,
        })

        clearAllTimers()
        process.exit(1)
    })

    process.on('unhandledRejection', (reason, promise) => {
        const structuredError = handleError(reason, {
            correlationId: createCorrelationId(),
            details: { promise: promise.toString() },
        })

        errorLog({
            message: 'Unhandled Promise Rejection - Application will exit',
            error: structuredError,
            correlationId: structuredError.metadata.correlationId,
        })

        clearAllTimers()
        process.exit(1)
    })

    process.on('SIGINT', () => {
        infoLog({
            message: 'Received SIGINT, shutting down gracefully...',
            correlationId: createCorrelationId(),
        })
        clearAllTimers()
        process.exit(0)
    })

    process.on('SIGTERM', () => {
        infoLog({
            message: 'Received SIGTERM, shutting down gracefully...',
            correlationId: createCorrelationId(),
        })
        clearAllTimers()
        process.exit(0)
    })
}
