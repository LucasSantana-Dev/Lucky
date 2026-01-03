import { v4 as uuidv4 } from 'uuid'
import { errorLog } from '../general/log'
import { MusicError, type MusicErrorCode } from '../../types/errors/music'
import { VALIDATION_ERROR_CODES } from '../../types/errors/validation'
import { captureException } from '../monitoring'
import type { ErrorContext } from './types'

type ErrorCode =
    (typeof VALIDATION_ERROR_CODES)[keyof typeof VALIDATION_ERROR_CODES]

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
    code: ErrorCode = VALIDATION_ERROR_CODES.VALIDATION_INVALID_INPUT,
    context?: ErrorContext,
): MusicError {
    const correlationId = context?.correlationId ?? createCorrelationId()

    if (error instanceof MusicError) {
        return error
    }

    const message = error instanceof Error ? error.message : String(error)

    return new MusicError(message, code as MusicErrorCode, {
        correlationId,
        userId: context?.userId,
        guildId: context?.guildId,
        commandName: context?.commandName,
        details: context?.additionalInfo,
    })
}

/**
 * Creates a user-friendly error message
 */
export function createUserErrorMessage(error: unknown): string {
    if (error instanceof MusicError) {
        return error.message
    }

    if (error instanceof Error) {
        // Map common error messages to user-friendly versions
        if (error.message.includes('timeout')) {
            return 'The request timed out. Please try again.'
        }
        if (error.message.includes('network')) {
            return 'Network error occurred. Please check your connection.'
        }
        if (error.message.includes('permission')) {
            return "You don't have permission to perform this action."
        }
    }

    return 'An unexpected error occurred. Please try again.'
}

/**
 * Logs an error with appropriate level and context
 */
export function logError(error: unknown, context?: ErrorContext): void {
    const wrappedError = wrapError(error, undefined, context)

    errorLog({
        message: 'Error occurred',
        error: wrappedError,
        correlationId: wrappedError.metadata.correlationId,
    })

    // Capture in monitoring system
    captureException(wrappedError, {
        correlationId: wrappedError.metadata.correlationId,
        context,
    })
}
