/**
 * Centralized error handling utilities following structured error patterns
 */

import { errorLog, warnLog, infoLog } from "../general/log"
import {
    BotError,
    ErrorCode,
    type ErrorMetadata,
    NetworkError,
    MusicError,
    YouTubeError,
    ValidationError,
    ConfigurationError,
} from "../../types/errors"
import { v4 as uuidv4 } from "uuid"
import { captureException } from "../monitoring"

/**
 * Error handler configuration
 */
type ErrorHandlerConfig = {
    logErrors: boolean
    logStackTraces: boolean
    includeCorrelationId: boolean
    maxRetryAttempts: number
    retryDelayMs: number
}

const defaultConfig: ErrorHandlerConfig = {
    logErrors: true,
    logStackTraces: process.env.NODE_ENV === "development",
    includeCorrelationId: true,
    maxRetryAttempts: 3,
    retryDelayMs: 1000,
}

/**
 * Creates a correlation ID for error tracking
 */
export function createCorrelationId(): string {
    return uuidv4()
}

/**
 * Wraps an unknown error into a structured BotError
 */
export function wrapError(
    error: unknown,
    code: ErrorCode = ErrorCode.UNKNOWN_ERROR,
    message?: string,
    metadata: Partial<ErrorMetadata> = {},
): BotError {
    if (error instanceof BotError) {
        return error
    }

    const errorMessage =
        message ?? (error instanceof Error ? error.message : String(error))
    const cause = error instanceof Error ? error : undefined

    return new BotError(code, errorMessage, metadata, cause)
}

/**
 * Handles and logs errors with structured information
 */
export function handleError(
    error: unknown,
    context: string,
    metadata: Partial<ErrorMetadata> = {},
    config: Partial<ErrorHandlerConfig> = {},
): BotError {
    const finalConfig = { ...defaultConfig, ...config }
    const correlationId = finalConfig.includeCorrelationId
        ? createCorrelationId()
        : undefined

    const botError = wrapError(error, undefined, undefined, {
        correlationId,
        ...metadata,
    })

    if (finalConfig.logErrors) {
        const logData = {
            message: `Error in ${context}: ${botError.getLogMessage()}`,
            error: botError,
            context,
            correlationId: botError.metadata.correlationId,
            retryable: botError.isRetryable(),
            stack: finalConfig.logStackTraces ? botError.stack : undefined,
        }

        // Use appropriate log level based on error type
        if (botError.code === ErrorCode.YOUTUBE_PARSER_ERROR) {
            warnLog(logData)
        } else {
            errorLog(logData)
        }
    }

    // Send detailed error to Sentry for monitoring
    captureException(botError, {
        context,
        correlationId: botError.metadata.correlationId,
        errorCode: botError.code,
        retryable: botError.isRetryable(),
        userMessage: botError.getUserMessage(),
        metadata: botError.metadata,
    })

    return botError
}

/**
 * Creates a retryable operation with exponential backoff
 */
export async function withRetry<T>(
    operation: () => Promise<T>,
    maxAttempts: number = defaultConfig.maxRetryAttempts,
    baseDelayMs: number = defaultConfig.retryDelayMs,
    context: string = "operation",
): Promise<T> {
    let lastError: Error | undefined

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await operation()
        } catch (error) {
            lastError =
                error instanceof Error ? error : new Error(String(error))

            const botError = wrapError(error)

            // Don't retry if error is not retryable
            if (!botError.isRetryable() && attempt < maxAttempts) {
                infoLog({
                    message: `Non-retryable error in ${context}, skipping retry`,
                    data: { error: botError.getLogMessage(), attempt },
                })
                break
            }

            if (attempt === maxAttempts) {
                errorLog({
                    message: `Operation failed after ${maxAttempts} attempts in ${context}`,
                    error: botError,
                })
                break
            }

            const delay = baseDelayMs * Math.pow(2, attempt - 1)
            infoLog({
                message: `Retrying operation in ${context} (attempt ${attempt + 1}/${maxAttempts}) after ${delay}ms`,
                data: { error: botError.getLogMessage(), delay },
            })

            await new Promise((resolve) => setTimeout(resolve, delay))
        }
    }

    throw lastError ?? new Error(`Operation failed in ${context}`)
}

/**
 * Error boundary for async operations
 */
export async function withErrorBoundary<T>(
    operation: () => Promise<T>,
    context: string,
    fallback?: () => T | Promise<T>,
    metadata: Partial<ErrorMetadata> = {},
): Promise<T> {
    try {
        return await operation()
    } catch (error) {
        const botError = handleError(error, context, metadata)

        if (fallback) {
            try {
                return await fallback()
            } catch (fallbackError) {
                const fallbackBotError = handleError(
                    fallbackError,
                    `${context} fallback`,
                    metadata,
                )
                throw fallbackBotError
            }
        }

        throw botError
    }
}

/**
 * Validates required environment variables
 */
export function validateEnvironment(requiredVars: string[]): void {
    const missing = requiredVars.filter((varName) => !process.env[varName])

    if (missing.length > 0) {
        throw new ConfigurationError(
            `Missing required environment variables: ${missing.join(", ")}`,
            { details: { missingVariables: missing } },
        )
    }
}

/**
 * Creates user-friendly error messages for Discord embeds
 * These messages are generic and don't expose technical details
 */
export function createUserErrorMessage(error: unknown): string {
    if (error instanceof BotError) {
        return error.getUserMessage()
    }

    const errorMessage = error instanceof Error ? error.message : String(error)

    // Map common error patterns to user-friendly messages
    if (
        errorMessage.includes("voice channel") ||
        errorMessage.includes("voice")
    ) {
        return "❌ Could not connect to voice channel. Check if the bot has the necessary permissions."
    }

    if (
        errorMessage.includes("permission") ||
        errorMessage.includes("forbidden")
    ) {
        return "❌ Insufficient permissions to execute this action. Check the bot's permissions."
    }

    if (
        errorMessage.includes("not found") ||
        errorMessage.includes("not found") ||
        errorMessage.includes("404")
    ) {
        return "❌ Content not found. Try with a different search."
    }

    if (
        errorMessage.includes("timeout") ||
        errorMessage.includes("timed out") ||
        errorMessage.includes("ECONNRESET")
    ) {
        return "⏱️ Operation timed out. Try again in a few seconds."
    }

    if (errorMessage.includes("rate limit") || errorMessage.includes("429")) {
        return "🚫 Too many requests. Please wait a moment before trying again."
    }

    if (errorMessage.includes("youtube") || errorMessage.includes("yt-dlp")) {
        return "🎵 Error processing YouTube content. Try again or use a different link."
    }

    if (errorMessage.includes("opus") || errorMessage.includes("audio")) {
        return "🔊 Audio processing error. Try again in a few seconds."
    }

    if (
        errorMessage.includes("network") ||
        errorMessage.includes("connection")
    ) {
        return "🌐 Connection error. Check your internet and try again."
    }

    if (errorMessage.includes("queue")) {
        return "📋 Queue error. Please try again."
    }

    // Generic fallback message
    return "❌ An unexpected error occurred. Please try again later."
}

/**
 * Checks if an error is a known recoverable error
 */
export function isRecoverableError(error: unknown): boolean {
    if (error instanceof BotError) {
        return error.isRetryable()
    }

    if (error instanceof Error) {
        const message = error.message.toLowerCase()
        return (
            message.includes("timeout") ||
            message.includes("network") ||
            message.includes("connection") ||
            message.includes("rate limit") ||
            message.includes("youtube") ||
            message.includes("parser")
        )
    }

    return false
}

/**
 * Handles Discord interaction errors with user-friendly responses
 * This function logs detailed errors to Sentry and returns generic messages for users
 */
export async function handleDiscordError(
    error: unknown,
    context: string,
    interaction?: { user?: { id: string; username: string } },
    metadata: Partial<ErrorMetadata> = {},
): Promise<string> {
    const botError = handleError(error, context, metadata)

    // Set user context in Sentry if interaction is available
    if (interaction?.user) {
        const { setUserContext } = await import("../monitoring")
        setUserContext(interaction.user.id, interaction.user.username, {
            errorContext: context,
            correlationId: botError.metadata.correlationId,
        })
    }

    // Return user-friendly message
    return botError.getUserMessage()
}

/**
 * Domain-specific error creators
 */
export const ErrorCreators = {
    network: (
        message: string,
        cause?: Error,
        metadata: Partial<ErrorMetadata> = {},
    ) => new NetworkError(message, metadata, cause),

    music: (
        code: ErrorCode,
        message: string,
        cause?: Error,
        metadata: Partial<ErrorMetadata> = {},
    ) => new MusicError(code, message, metadata, cause),

    youtube: (
        message: string,
        cause?: Error,
        metadata: Partial<ErrorMetadata> = {},
    ) => new YouTubeError(message, metadata, cause),

    validation: (
        message: string,
        cause?: Error,
        metadata: Partial<ErrorMetadata> = {},
    ) => new ValidationError(message, metadata, cause),

    config: (
        message: string,
        cause?: Error,
        metadata: Partial<ErrorMetadata> = {},
    ) => new ConfigurationError(message, metadata, cause),
}
