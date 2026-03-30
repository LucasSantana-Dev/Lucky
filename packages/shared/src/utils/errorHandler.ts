import { errorLog, infoLog } from './general/log'
import { clearAllTimers } from './timerManager'
import { handleError, createCorrelationId } from './error/errorHandler'
import { flushSentry } from './monitoring/sentry'

async function shutdown(exitCode: number): Promise<void> {
    clearAllTimers()
    await flushSentry(3000)
    process.exit(exitCode)
}

export function setupErrorHandlers() {
    process.on('uncaughtException', (error) => {
        void (async () => {
            const structuredError = handleError(error, {
                correlationId: createCorrelationId(),
            })

            errorLog({
                message: 'Uncaught Exception - Application will exit',
                error: structuredError,
                correlationId: structuredError.metadata.correlationId,
            })

            await shutdown(1)
        })()
    })

    process.on('unhandledRejection', (reason, promise) => {
        void (async () => {
            const structuredError = handleError(reason, {
                correlationId: createCorrelationId(),
                details: { promise: promise.toString() },
            })

            errorLog({
                message: 'Unhandled Promise Rejection - Application will exit',
                error: structuredError,
                correlationId: structuredError.metadata.correlationId,
            })

            await shutdown(1)
        })()
    })

    process.on('SIGINT', () => {
        void (async () => {
            infoLog({
                message: 'Received SIGINT, shutting down gracefully...',
                correlationId: createCorrelationId(),
            })
            await shutdown(0)
        })()
    })

    process.on('SIGTERM', () => {
        void (async () => {
            infoLog({
                message: 'Received SIGTERM, shutting down gracefully...',
                correlationId: createCorrelationId(),
            })
            await shutdown(0)
        })()
    })
}
