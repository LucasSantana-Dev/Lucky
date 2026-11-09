import { errorLog, infoLog, warnLog } from './general/log'
import { clearAllTimers } from './timerManager'
import { handleError, createCorrelationId } from './error/errorHandler'
import { flushSentry } from './monitoring/sentry'

// discord-player starts the next track without a catch after a stream fails
// (GuildQueuePlayerNode #throw: `void this.play(nextTrack)`). When the bot
// has already left voice, that play rejects with NoVoiceConnectionError and
// nothing in our code can await it. The queue is dead either way, so exiting
// only turns one failed autoplay into a full bot restart.
const NON_FATAL_REJECTION_CODES = new Set(['ERR_NO_VOICE_CONNECTION'])

export function isNonFatalRejection(reason: unknown): boolean {
    if (typeof reason !== 'object' || reason === null) return false
    const code = (reason as { code?: unknown }).code
    return typeof code === 'string' && NON_FATAL_REJECTION_CODES.has(code)
}

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
        if (isNonFatalRejection(reason)) {
            warnLog({
                message:
                    'Unhandled rejection from a play without a voice connection, process keeps running',
                error: reason,
            })
            return
        }
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
