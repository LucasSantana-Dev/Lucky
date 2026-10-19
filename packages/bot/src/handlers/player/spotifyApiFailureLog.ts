import { warnLog } from '@lucky/shared/utils'

// discord-player-spotify's SpotifyAPI.search() catches every error and
// returns null, so a 401, 403 or 429 from Spotify reaches the bot only as
// NoResultError, the same as a query with no match (#2134, #2207). Its
// private fetchData() is the last place the status still exists: it throws
// `Failed to fetch Spotify data: <status>` on a non-2xx answer, and a failed
// token request throws from inside it too. Wrapping it puts the status in the
// logs before search() swallows it.

type FetchData = (
    url: string,
    options?: Parameters<typeof fetch>[1],
) => Promise<Response>

const WARN_COOLDOWN_MS = 5 * 60_000

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

export function resetSpotifyApiFailureLogForTests(): void {
    lastWarnAt.clear()
    warnedUnwrappable = false
}

function endpointOf(url: string): string {
    try {
        // Path only: the query string carries the user's search text.
        return new URL(url).pathname
    } catch {
        return 'unknown'
    }
}

export function reportSpotifyApiFailure(
    url: string,
    error: unknown,
    now = Date.now(),
): void {
    const message = error instanceof Error ? error.message : String(error)
    const status = /: (\d{3})$/.exec(message)?.[1] ?? 'none'
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
    const fetchData = api.fetchData.bind(api)
    api.fetchData = async (url, options) => {
        try {
            return await fetchData(url, options)
        } catch (error) {
            reportSpotifyApiFailure(url, error)
            throw error
        }
    }
}
