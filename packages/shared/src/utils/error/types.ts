// Removed unused import

/** Error handler configuration. */
export type ErrorHandlerConfig = {
    logErrors: boolean
    logStackTraces: boolean
    includeCorrelationId: boolean
    maxRetryAttempts: number
    retryDelayMs: number
}

/** Default error handler configuration. */
export const defaultConfig: ErrorHandlerConfig = {
    logErrors: true,
    logStackTraces: process.env.NODE_ENV === 'development',
    includeCorrelationId: true,
    maxRetryAttempts: 3,
    retryDelayMs: 1000,
}

/** Context information for error handling and logging. */
export type ErrorContext = {
    correlationId?: string
    userId?: string
    guildId?: string
    commandName?: string
    additionalInfo?: Record<string, unknown>
}

/** Retry configuration for resilient operations. */
export type RetryOptions = {
    maxAttempts: number
    delayMs: number
    backoffMultiplier: number
}
