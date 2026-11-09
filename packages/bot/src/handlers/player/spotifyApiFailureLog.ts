import { AsyncLocalStorage } from 'node:async_hooks'
import { warnLog } from '@lucky/shared/utils'

// discord-player-spotify's SpotifyAPI.search() catches every error and
// returns null, so a 401, 403 or 429 from Spotify reaches the bot only as
// NoResultError, the same as a query with no match (#2134, #2207). Its
// private fetchData() is the last place the status still exists: it throws
// `Failed to fetch Spotify data: <status>` on a non-2xx answer, and a failed
// token request throws from inside it too. Wrapping it puts the status in the
// logs before search() swallows it.
//
// A 429 also means "stop asking": in development mode Spotify answers
// QUOTA_EXCEEDED with a Retry-After of hours, and every further call is
// wasted latency that may extend the block. fetchData() throws away the
// response, so the global fetch is observed while fetchData() runs (scoped
// with AsyncLocalStorage, nothing outside it is touched) to read Retry-After,
// and calls fail fast without a network request until that time passes.

type FetchData = (
    url: string,
    options?: Parameters<typeof fetch>[1],
) => Promise<Response>

const WARN_COOLDOWN_MS = 5 * 60_000
const DEFAULT_BLOCK_MS = 60_000
// A bogus Retry-After (say 1e20) must not stop Spotify for good or push the
// date past what toISOString() accepts. Quota blocks seen so far are ~6h.
const MAX_BLOCK_MS = 24 * 60 * 60_000

// Spotify's own meaning for each status on this client-credentials path,
// so the log line says what to check (developer.spotify.com quota modes).
const STATUS_HINTS: Record<string, string> = {
    '400': 'request rejected, check the query parameters',
    '401': 'token rejected, check SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET',
    '403': 'forbidden, the app owner needs Premium for a development mode app',
    '429': 'rate limit or development mode quota (QUOTA_EXCEEDED) reached',
}

const lastWarnAt = new Map<string, number>()
let warnedUnwrappable = false
let blockedUntil = 0

const lastResponse = new AsyncLocalStorage<{ response?: Response }>()
let unobservedFetch: typeof fetch | undefined

export function resetSpotifyApiFailureLogForTests(): void {
    lastWarnAt.clear()
    warnedUnwrappable = false
    blockedUntil = 0
    if (unobservedFetch) globalThis.fetch = unobservedFetch
    unobservedFetch = undefined
}

function endpointOf(url: string): string {
    try {
        // Path only: the query string carries the user's search text.
        return new URL(url).pathname
    } catch {
        return 'unknown'
    }
}

function statusOf(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error)
    return /: (\d{3})$/.exec(message)?.[1] ?? 'none'
}

export function reportSpotifyApiFailure(
    url: string,
    error: unknown,
    now = Date.now(),
): void {
    const message = error instanceof Error ? error.message : String(error)
    const status = statusOf(error)
    if (now - (lastWarnAt.get(status) ?? -Infinity) < WARN_COOLDOWN_MS) return
    lastWarnAt.set(status, now)
    warnLog({
        message: 'Spotify extractor request failed',
        data: {
            status,
            endpoint: endpointOf(url),
            hint: STATUS_HINTS[status] ?? 'see error',
            error: message,
        },
    })
}

// Retry-After is either delay-seconds or an HTTP date (RFC 9110 10.2.3).
export function retryAfterMs(
    header: string | null | undefined,
    now = Date.now(),
): number {
    return Math.min(parseRetryAfterMs(header, now), MAX_BLOCK_MS)
}

function parseRetryAfterMs(
    header: string | null | undefined,
    now = Date.now(),
): number {
    const value = header?.trim()
    if (value) {
        const seconds = Number(value)
        if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000
        const date = Date.parse(value)
        if (Number.isFinite(date) && date > now) return date - now
    }
    return DEFAULT_BLOCK_MS
}

function blockSpotifyApi(retryAfter: string | null, now = Date.now()): void {
    const until = now + retryAfterMs(retryAfter, now)
    if (until <= blockedUntil) return
    const wasBlocked = blockedUntil > now
    blockedUntil = until
    if (wasBlocked) return
    warnLog({
        message:
            'Spotify API answered 429, skipping Spotify calls until it unblocks',
        data: {
            unblocksAt: new Date(until).toISOString(),
            retryAfter: retryAfter ?? 'none',
        },
    })
}

function blockAfterFailure(error: unknown, response?: Response): void {
    if (response?.status === 429) {
        blockSpotifyApi(response.headers.get('retry-after'))
    } else if (statusOf(error) === '429') {
        blockSpotifyApi(null)
    }
}

function observeFetch(): void {
    if (unobservedFetch) return
    const original = globalThis.fetch
    unobservedFetch = original
    globalThis.fetch = async (...args) => {
        const response = await original(...args)
        const store = lastResponse.getStore()
        if (store) store.response = response
        return response
    }
}

export function logSpotifyApiFailures(extractor: unknown): void {
    const api = (extractor as { internal?: { fetchData?: FetchData } } | null)
        ?.internal
    if (!api || typeof api.fetchData !== 'function') {
        if (!warnedUnwrappable) {
            warnedUnwrappable = true
            warnLog({
                message:
                    'SpotifyExtractor internals changed, Spotify API failures stay hidden behind NoResultError',
            })
        }
        return
    }
    observeFetch()
    const fetchData = api.fetchData.bind(api)
    api.fetchData = async (url, options) => {
        if (Date.now() < blockedUntil) {
            throw new Error(
                `Spotify API blocked until ${new Date(blockedUntil).toISOString()}`,
            )
        }
        const store: { response?: Response } = {}
        try {
            return await lastResponse.run(store, () => fetchData(url, options))
        } catch (error) {
            reportSpotifyApiFailure(url, error)
            blockAfterFailure(error, store.response)
            throw error
        }
    }
}
