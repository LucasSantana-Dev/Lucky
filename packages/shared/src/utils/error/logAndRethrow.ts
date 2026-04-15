import { errorLog, debugLog } from '../general/log'

/**
 * Log error and re-throw with context.
 * Use when the operation must fail and propagate the error.
 */
export function logAndRethrow(
    err: unknown,
    context: string,
    data?: Record<string, unknown>,
): never {
    const error = err instanceof Error ? err : new Error(String(err))
    errorLog({ message: `${context}: ${error.message}`, error, data })
    throw error
}

/**
 * Log error at debug level and swallow it.
 * Use for best-effort operations where failure is acceptable.
 */
export function logAndSwallow(
    err: unknown,
    context: string,
    data?: Record<string, unknown>,
): void {
    const error = err instanceof Error ? err : new Error(String(err))
    debugLog({
        message: `${context}: ${error.message}`,
        data: { ...data, stack: error.stack?.slice(0, 500) },
    })
}
