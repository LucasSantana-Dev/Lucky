export * from './errorWrapper'
export * from './logAndRethrow'

// Main error handler implementation
import type { MusicError } from '../../types/errors/music'
import { errorLog } from '../general/log'
import { captureException } from '../monitoring'
import {
    wrapError,
    createUserErrorMessage as createUserMsg,
} from './errorWrapper'

/**
 * Main error handler function
 */
export function handleError(
    error: unknown,
    context?: {
        userId?: string
        guildId?: string
        commandName?: string
        correlationId?: string
        details?: Record<string, unknown>
    },
): MusicError {
    const wrappedError = wrapError(error, undefined, context)

    errorLog({
        message: 'Error handled',
        error: wrappedError,
        correlationId: context?.correlationId,
    })

    captureException(wrappedError, {
        correlationId: context?.correlationId,
        context,
    })

    return wrappedError
}

/**
 * Create user-friendly error message
 */
export function createUserErrorMessage(error: unknown): string {
    return createUserMsg(error)
}
