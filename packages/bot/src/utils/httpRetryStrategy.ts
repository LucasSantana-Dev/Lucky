import { debugLog, warnLog } from '@lucky/shared/utils/general/log'

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

const DEFAULT_RETRY_AFTER_MS = 1000
const MAX_RETRY_AFTER_MS = 60 * 1000

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
 */
export function throwIfRetryable(res: Response): void {
    if (res.status === 429) throw res
}

/**
 * Generic 429-aware retry wrapper shared by external API clients (Twitch,
 * and available to any future integration) so each doesn't reinvent
 * Retry-After parsing and backoff. Mirrors the pattern originally built for
 * Spotify (spotify/spotifyApi.ts's withSpotifyRetry) - #1974.
 */
export async function withRetry<T>(
    label: string,
    fn: () => Promise<T>,
    maxRetries = 2,
): Promise<T> {
    let attempt = 0
    while (true) {
        try {
            return await fn()
        } catch (error) {
            const isResponse = error instanceof Response
            const status = isResponse ? error.status : null

            if (status === 429 && attempt < maxRetries) {
                const retryAfterHeader = isResponse
                    ? error.headers.get('Retry-After')
                    : null
                const parsedDelayMs = parseRetryAfterMs(retryAfterHeader)
                const delayMs = Math.min(
                    parsedDelayMs ?? DEFAULT_RETRY_AFTER_MS,
                    MAX_RETRY_AFTER_MS,
                )
                debugLog({
                    message: `${label} 429 rate limit, retrying`,
                    data: {
                        attempt,
                        maxRetries,
                        delayMs,
                        retryAfterHeader,
                    },
                })
                await sleep(delayMs)
                attempt++
                continue
            }

            if (status === 429) {
                warnLog({
                    message: `${label} 429 retry exhausted`,
                    data: { attempt, maxRetries },
                })
            }

            throw error
        }
    }
}
