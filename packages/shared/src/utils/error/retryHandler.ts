import { warnLog } from '../general/log'
import type { RetryOptions } from './types'
import { MusicError } from '../../types/errors/music'

/**
 * Retry configuration for different error types
 */
export const retryConfigs: Record<string, RetryOptions> = {
    network: {
        maxAttempts: 3,
        delayMs: 1000,
        backoffMultiplier: 2,
    },
    rateLimit: {
        maxAttempts: 5,
        delayMs: 2000,
        backoffMultiplier: 1.5,
    },
    temporary: {
        maxAttempts: 2,
        delayMs: 500,
        backoffMultiplier: 2,
    },
}

/**
 * Determines if an error should be retried
 */
export function shouldRetry(error: unknown): boolean {
    if (error instanceof MusicError) {
        // Check if it's a retryable error based on the error code
        return (
            error.code === 'ERR_MUSIC_PLAYBACK_FAILED' ||
            error.code === 'ERR_MUSIC_DOWNLOAD_FAILED'
        )
    }

    if (error instanceof Error) {
        const message = error.message.toLowerCase()
        return (
            message.includes('timeout') ||
            message.includes('network') ||
            message.includes('rate limit') ||
            message.includes('temporary')
        )
    }

    return false
}

/**
 * Calculates the delay for the next retry attempt
 */
export function calculateRetryDelay(
    attempt: number,
    baseDelay: number,
    backoffMultiplier: number,
): number {
    return baseDelay * Math.pow(backoffMultiplier, attempt - 1)
}

/**
 * Executes a function with retry logic
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions,
    _context?: string,
): Promise<T> {
    let lastError: unknown

    for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
        try {
            return await fn()
        } catch (error) {
            lastError = error

            if (!shouldRetry(error) || attempt === options.maxAttempts) {
                break
            }

            const delay = calculateRetryDelay(
                attempt,
                options.delayMs,
                options.backoffMultiplier,
            )

            warnLog({
                message: `Retry attempt ${attempt}/${options.maxAttempts} failed`,
                error,
            })

            await new Promise((resolve) => setTimeout(resolve, delay))
        }
    }

    throw lastError
}

/**
 * Creates a retry wrapper for a function
 */
export function createRetryWrapper<T extends unknown[], R>(
    fn: (...args: T) => Promise<R>,
    retryType: keyof typeof retryConfigs = 'network',
) {
    return async (...args: T): Promise<R> => {
        const config = retryConfigs[retryType]
        return withRetry(() => fn(...args), config, fn.name)
    }
}

export const isRetryable = shouldRetry
export const retryOperation = withRetry
