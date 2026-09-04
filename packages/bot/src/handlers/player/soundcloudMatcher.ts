import * as playdl from 'play-dl'
import type { Readable } from 'stream'
import { infoLog, warnLog } from '@lucky/shared/utils'
import { withTimeout } from './withTimeout'

type SoundCloudSearchResult = {
    name: string
    url: string
    durationInSec?: number
}

const TITLE_MATCH_THRESHOLD = 0.75
const CLIENT_ID_TIMEOUT_MS = 10_000
const REFRESH_COOLDOWN_MS = 60_000

/**
 * play-dl authenticates SoundCloud with an anonymous client id scraped from
 * soundcloud.com, and those ids rotate. #2139: the id was fetched once at boot
 * and never refreshed, so once it expired every SoundCloud fallback stage
 * failed for the rest of the process lifetime while the bot still reported
 * healthy and logged nothing above debug level.
 *
 * Single-flight, because a queue that fails several tracks at once would
 * otherwise scrape a new id per failure.
 */
let refreshInFlight: Promise<void> | null = null
let lastRefreshAt = 0

export async function refreshSoundCloudClientId(): Promise<void> {
    refreshInFlight ??= (async () => {
        try {
            const clientId = await withTimeout(
                playdl.getFreeClientID(),
                CLIENT_ID_TIMEOUT_MS,
                'play-dl getFreeClientID',
            )
            await playdl.setToken({ soundcloud: { client_id: clientId } })
            lastRefreshAt = Date.now()
            infoLog({ message: 'play-dl: SoundCloud client ID initialized' })
        } finally {
            refreshInFlight = null
        }
    })()
    return refreshInFlight
}

// Test-only: the cooldown above is module-level state, so tests that assert on
// the refresh path must reset it between cases instead of relying on run order.
export function __resetSoundCloudRefreshStateForTests(): void {
    refreshInFlight = null
    lastRefreshAt = 0
}

/**
 * Runs a play-dl network call; on failure refreshes the client id once and
 * retries. Only the play-dl calls are wrapped: the "no results" and "no
 * validated match" rejections below are raised after a *successful* search, so
 * a genuine miss never triggers a scrape.
 */
async function withClientIdRetry<T>(
    op: () => Promise<T>,
    label: string,
): Promise<T> {
    try {
        return await op()
    } catch (error) {
        // Not every rejection is an expired token: a deleted track, a socket
        // blip or a rate limit lands here too, and scraping a fresh id for each
        // of those would make a queue of bad tracks pay a 10s stall per track.
        // Classifying the error by message would be the obvious scope, but that
        // couples recovery to play-dl's wording and silently stops working when
        // it changes. A cooldown bounds the waste without reading the error:
        // a genuinely stale token is fixed by the first refresh, and everything
        // failing after it rethrows untouched.
        if (Date.now() - lastRefreshAt < REFRESH_COOLDOWN_MS) throw error

        warnLog({
            message: `SoundCloud: ${label} failed, refreshing client ID and retrying once`,
            error,
        })
        try {
            await refreshSoundCloudClientId()
        } catch {
            // Surface why the call actually failed, not why the recovery did.
            throw error
        }
        return op()
    }
}

export async function streamViaSoundCloud(
    query: string,
    trackDuration?: string,
): Promise<Readable> {
    if (!query.trim()) {
        throw new Error('SoundCloud: empty query')
    }

    const results = await withClientIdRetry(
        () =>
            playdl.search(query, {
                source: { soundcloud: 'tracks' },
                limit: 5,
            }),
        'search',
    )

    if (!results.length) {
        throw new Error(`SoundCloud: no results for "${query}"`)
    }

    const match = findMatchingSoundCloudResult(query, trackDuration, results)
    if (!match) {
        throw new Error(
            `SoundCloud: no validated match for "${query}" (title/duration mismatch)`,
        )
    }

    let scStream: Awaited<ReturnType<typeof playdl.stream>>
    try {
        scStream = await withClientIdRetry(
            () => playdl.stream(match.url),
            'stream',
        )
    } catch (err) {
        throw new Error(
            `SoundCloud: stream creation failed for "${match.name}" — ${(err as Error).message}`,
            { cause: err },
        )
    }
    return scStream.stream
}

export function findMatchingSoundCloudResult(
    query: string,
    trackDuration: string | undefined,
    results: readonly SoundCloudSearchResult[],
): SoundCloudSearchResult | undefined {
    const queryNorm = normalizeForMatch(query)
    if (!queryNorm) return undefined

    const tokens = queryNorm.split(/ +/).filter(Boolean)
    if (tokens.length === 0) return undefined

    const trackSec = parseDurationString(trackDuration)

    const candidates = results
        .map((result) => {
            const resultNorm = normalizeForMatch(result.name)
            if (!resultNorm) return null

            const matched = tokens.filter((token) =>
                resultNorm.includes(token),
            ).length
            const titleScore = matched / tokens.length
            if (titleScore < TITLE_MATCH_THRESHOLD) return null

            if (
                trackSec !== null &&
                result.durationInSec &&
                Math.abs(result.durationInSec - trackSec) > 30
            ) {
                return null
            }

            return { result, titleScore }
        })
        .filter(
            (c): c is { result: SoundCloudSearchResult; titleScore: number } =>
                c !== null,
        )

    if (candidates.length === 0) return undefined
    if (trackSec === null) return candidates[0].result

    // The 75%-token threshold lets remixes/speedups/extended edits pass
    // title matching too, and SoundCloud's search order is not a quality
    // ranking. Prefer the closer title match first — an exact title match
    // with no duration data is a more trustworthy signal than a near-miss
    // duration match on a looser title. Only at equal title confidence does
    // duration closeness break the tie, as the cheapest remaining signal
    // that a candidate is the original recording rather than an altered one;
    // missing duration data is treated as neutral there, not disqualifying.
    return candidates.reduce((best, candidate) => {
        if (candidate.titleScore !== best.titleScore) {
            return candidate.titleScore > best.titleScore ? candidate : best
        }
        if (!candidate.result.durationInSec) return best
        if (!best.result.durationInSec) return candidate
        const bestDiff = Math.abs(best.result.durationInSec - trackSec)
        const candidateDiff = Math.abs(
            candidate.result.durationInSec - trackSec,
        )
        return candidateDiff < bestDiff ? candidate : best
    }, candidates[0]).result
}

function normalizeForMatch(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, '')
        .replace(/ {2,}/g, ' ') // NOSONAR: S5852 — bounded input, no catastrophic backtracking risk
        .trim()
}

export function parseDurationString(duration?: string): number | null {
    if (!duration) return null
    const parts = duration.split(':').map(Number)
    if (parts.some(Number.isNaN)) return null
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
    return null
}
