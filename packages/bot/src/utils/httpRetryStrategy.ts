import { randomInt } from 'node:crypto'

import { debugLog, warnLog } from '@lucky/shared/utils/general/log'

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

// Jitter uses crypto.randomInt purely to satisfy S2245 - backoff spread is not
// security-sensitive, but the gate treats Math.random as a finding.
function jitterMs(): number {
    return randomInt(0, 1000)
}

const MAX_RETRY_AFTER_MS = 60 * 1000

/**
 * Heuristic check: is this error likely network-related?
 *
 * In Node.js and browsers, network failures don't throw a specific error type,
 * so we check common patterns: error names/messages suggesting DNS, timeout,
 * or connection issues, or errors without a stack (fetch API under certain
 * conditions). If unsure, return false — let the caller explicitly throw if
 * they want retry behavior.
 *
 * Note: Node's fetch (undici) wraps connection-level failures as `TypeError`
 * with message `'fetch failed'` and the real error in `error.cause`. We check
 * both the error itself and its cause chain recursively.
 */
function isNetworkError(error: unknown): boolean {
    if (!(error instanceof Error)) return false
    const msg = `${error.name} ${error.message}`.toLowerCase()
    const isNetworkPattern =
        msg.includes('econnrefused') ||
        msg.includes('enotfound') ||
        msg.includes('econnreset') ||
        msg.includes('etimedout') ||
        msg.includes('timeout') ||
        msg.includes('network') ||
        msg.includes('dns')

    if (isNetworkPattern) return true

    // Recursively check error.cause (Node fetch wraps connection errors here)
    if (error.cause instanceof Error) {
        return isNetworkError(error.cause)
    }

    return false
}

/**
 * Parse a Retry-After header value into a millisecond delay.
 *
 * Per RFC 7231 the header may be either:
 *   - delta-seconds: a non-negative integer ("120")
 *   - HTTP-date: an RFC 7231 IMF-fixdate ("Sat, 10 May 2026 12:00:00 GMT")
 *
 * Returns null when the header is missing or unparseable so callers can fall
 * back to a default delay (rather than NaN milliseconds, which becomes a busy
 * loop).
 */
export function parseRetryAfterMs(header: string | null): number | null {
    if (!header) return null
    const trimmed = header.trim()
    if (!trimmed) return null
    // delta-seconds form first — bare integer
    if (/^\d+$/.test(trimmed)) {
        const seconds = Number.parseInt(trimmed, 10)
        return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null
    }
    // HTTP-date form
    const targetMs = Date.parse(trimmed)
    if (!Number.isFinite(targetMs)) return null
    const delta = targetMs - Date.now()
    return delta > 0 ? delta : 0
}

/**
 * Throw the Response when its status is retryable so withRetry's catch block
 * can intercept it. fetch() does not throw on HTTP error statuses, so
 * wrapped callbacks must signal retry-eligible failures explicitly.
 *
 * 429 is always retryable; pass `extraStatuses` (e.g. 5xx) to opt a
 * particular caller into retrying additional statuses too.
 */
export function throwIfRetryable(
    res: Response,
    extraStatuses: number[] = [],
): void {
    if (res.status === 429 || extraStatuses.includes(res.status)) throw res
}

export type WithRetryOptions = {
    retryableStatuses?: number[]
    retryNetworkErrors?: boolean
}

function isRetryable(
    error: unknown,
    { retryableStatuses = [429], retryNetworkErrors = false }: WithRetryOptions,
): boolean {
    if (error instanceof Response)
        return error.status === 429 || retryableStatuses.includes(error.status)
    return retryNetworkErrors && isNetworkError(error)
}

// Any retryable Response with a Retry-After header gets its server-specified
// delay; everything else (opted-in network errors, responses without the
// header) gets exponential backoff with jitter.
function computeDelayMs(error: unknown, attempt: number): number {
    const retryAfterMs =
        error instanceof Response
            ? parseRetryAfterMs(error.headers.get('Retry-After'))
            : null
    return Math.min(
        retryAfterMs ?? 1000 * 2 ** attempt + jitterMs(),
        MAX_RETRY_AFTER_MS,
    )
}

/**
 * Generic 429-aware retry wrapper shared by external API clients (Twitch,
 * and available to any future integration) so each doesn't reinvent
 * Retry-After parsing and backoff. Mirrors the pattern originally built for
 * Spotify (spotify/spotifyApi.ts's withSpotifyRetry) - #1974.
 *
 * By default only a 429 Response (thrown via throwIfRetryable) is retried,
 * using its Retry-After header. Pass `retryableStatuses` to also retry other
 * statuses (e.g. 5xx), and `retryNetworkErrors: true` to also retry thrown
 * non-Response errors (timeouts, DNS failures) - both use exponential
 * backoff with jitter since there's no Retry-After to honor.
 */
export async function withRetry<T>(
    label: string,
    fn: () => Promise<T>,
    maxRetries = 2,
    options: WithRetryOptions = {},
): Promise<T> {
    let attempt = 0
    while (true) {
        try {
            return await fn()
        } catch (error) {
            if (!isRetryable(error, options)) throw error

            if (attempt >= maxRetries) {
                warnLog({
                    message: `${label} retry exhausted`,
                    data: { attempt, maxRetries },
                })
                throw error
            }

            const delayMs = computeDelayMs(error, attempt)
            debugLog({
                message: `${label} retrying`,
                data: { attempt, maxRetries, delayMs },
            })
            await sleep(delayMs)
            attempt++
        }
    }
}
