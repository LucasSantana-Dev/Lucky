import * as playdl from 'play-dl'
import type { Readable } from 'stream'

type SoundCloudSearchResult = {
    name: string
    url: string
    durationInSec?: number
}

const TITLE_MATCH_THRESHOLD = 0.75

export async function streamViaSoundCloud(
    query: string,
    trackDuration?: string,
): Promise<Readable> {
    if (!query.trim()) {
        throw new Error('SoundCloud: empty query')
    }

    const results = await playdl.search(query, {
        source: { soundcloud: 'tracks' },
        limit: 5,
    })

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
        scStream = await playdl.stream(match.url)
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

    const candidates = results.filter((result) => {
        const resultNorm = normalizeForMatch(result.name)
        if (!resultNorm) return false

        const matched = tokens.filter((token) =>
            resultNorm.includes(token),
        ).length
        const titleMatch = matched / tokens.length >= TITLE_MATCH_THRESHOLD
        if (!titleMatch) return false

        if (trackSec === null || !result.durationInSec) return true
        return Math.abs(result.durationInSec - trackSec) <= 30
    })

    if (candidates.length === 0 || trackSec === null) return candidates[0]

    // The 75%-token threshold lets remixes/speedups/extended edits pass
    // title matching too. SoundCloud's search order is not a quality
    // ranking, so among qualifying candidates prefer the closest duration —
    // the cheapest signal available that a candidate is the original
    // recording rather than an altered one.
    return candidates.reduce((best, candidate) => {
        if (!candidate.durationInSec) return best
        if (!best.durationInSec) return candidate
        const bestDiff = Math.abs(best.durationInSec - trackSec)
        const candidateDiff = Math.abs(candidate.durationInSec - trackSec)
        return candidateDiff < bestDiff ? candidate : best
    }, candidates[0])
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
