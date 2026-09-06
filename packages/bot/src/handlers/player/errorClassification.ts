import {
    sanitizeErrorMessage,
    sanitizeStack,
    errorLog,
} from '@lucky/shared/utils'

import { cleanTitle } from '../../utils/music/searchQueryCleaner'

export function toErrorDetails(error: unknown): {
    errorMessage: string
    errorStack?: string
    errorName?: string
} {
    if (error instanceof Error) {
        return {
            errorMessage: error.message,

            errorStack:
                (sanitizeStack(error) as string | undefined) ??
                sanitizeErrorMessage(error),
            errorName: error.name,
        }
    }

    return {
        errorMessage: String(error),
        errorName: typeof error,
    }
}

export function toErrorInstance(error: unknown): Error | undefined {
    return error instanceof Error ? error : undefined
}

export function normalizeText(value?: string): string {
    return (value ?? '')
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, '')
        .trim()
}

export function isSameTrack(
    currentTrack: { title?: string; author?: string; url?: string },
    alternativeTrack: { title?: string; author?: string; url?: string },
): boolean {
    if (
        currentTrack.url &&
        alternativeTrack.url &&
        currentTrack.url === alternativeTrack.url
    ) {
        return true
    }
    const currentNorm = normalizeText(cleanTitle(currentTrack.title ?? ''))
    const altNorm = normalizeText(cleanTitle(alternativeTrack.title ?? ''))
    return currentNorm.length > 3 && currentNorm === altNorm
}

export function safeErrorLog(payload: {
    message: string
    error?: Error
    data?: Record<string, unknown>
}): void {
    try {
        errorLog(payload)
    } catch (error) {
        // errorLog itself failed, so fall back to console.error, which does
        // not depend on the logger that just threw, keeping the original
        // player error from being lost.
        console.error(payload.message, payload.error, payload.data, error)
    }
}

export function logHandlerFailure(message: string, error: unknown): void {
    safeErrorLog({
        message,
        error: toErrorInstance(error),
        data: toErrorDetails(error),
    })
}

export function runSafely(message: string, fn: () => void): void {
    try {
        fn()
    } catch (error) {
        logHandlerFailure(message, error)
    }
}

export async function runSafelyAsync(
    message: string,
    fn: () => Promise<void>,
): Promise<void> {
    try {
        await fn()
    } catch (error) {
        logHandlerFailure(message, error)
    }
}
