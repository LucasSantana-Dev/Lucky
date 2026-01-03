/**
 * Base error handler with common error handling patterns
 */

import { errorLog } from '../../utils/general/log'
import { captureException } from '../../utils/monitoring'
import type { MusicError } from './music'

export interface ErrorContext {
    userId?: string
    guildId?: string
    commandName?: string
    correlationId?: string
    details?: Record<string, unknown>
}

export abstract class BaseErrorHandler {
    protected handleError(
        error: unknown,
        context?: ErrorContext,
    ): MusicError {
        const wrappedError = this.wrapError(error, context)

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

    protected createUserErrorMessage(error: unknown): string {
        if (error instanceof Error) {
            return error.message
        }
        return 'An unexpected error occurred'
    }

    protected abstract wrapError(error: unknown, context?: ErrorContext): MusicError
}
