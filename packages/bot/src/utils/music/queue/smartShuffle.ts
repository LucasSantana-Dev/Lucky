export interface SmartShuffleOptions {
    streakLimit?: number
}

export interface SmartShuffleTrack {
    title: string
    author: string
    duration: string
    source: string
    requestedBy: { id: string } | null
}

function parseDurationSeconds(duration: string): number {
    const parts = duration.split(':').map(Number)
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    return 0
}

function energyScore(track: SmartShuffleTrack): number {
    const src = (track.source ?? '').toLowerCase()
    if (src === 'spotify') return 0.7
    if (src === 'soundcloud') return 0.5
    if (src === 'youtube' || src === 'youtube_music') {
        const secs = parseDurationSeconds(track.duration)
        if (secs > 0 && secs < 180) return 0.8
        if (secs >= 180 && secs <= 300) return 0.5
        if (secs > 300) return 0.2
    }
    return 0.5
}

export function smartShuffle<T extends SmartShuffleTrack>(
    tracks: T[],
    options?: SmartShuffleOptions,
): T[] {
    if (tracks.length <= 1) return [...tracks]

    const streakLimit = options?.streakLimit ?? 2

    const scored = tracks.map((t, i) => ({ track: t, score: energyScore(t), idx: i }))

    // Fisher-Yates shuffle within scored to randomize same-score ties
    for (let i = scored.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1)) // NOSONAR - non-cryptographic shuffle is intentional
        const tmp = scored[i]
        scored[i] = scored[j]
        scored[j] = tmp
    }

    // Sort by energy descending
    scored.sort((a, b) => b.score - a.score)

    // Interleave high (>=0.6) and low (<0.6) energy buckets
    const high = scored.filter((s) => s.score >= 0.6)
    const low = scored.filter((s) => s.score < 0.6)
    const interleaved: typeof scored = []
    const maxLen = Math.max(high.length, low.length)
    for (let i = 0; i < maxLen; i++) {
        if (i < high.length) interleaved.push(high[i])
        if (i < low.length) interleaved.push(low[i])
    }

    // Apply requester streak constraint: greedily pick from remaining pool
    const requesterId = (t: T): string => t.requestedBy?.id ?? '__none__'
    const pool = interleaved.map((s) => s.track)
    const result: T[] = []

    while (pool.length > 0) {
        const lastIds =
            result.length >= streakLimit
                ? result.slice(-streakLimit).map(requesterId)
                : []
        const streakId =
            lastIds.length === streakLimit && lastIds.every((id) => id === lastIds[0])
                ? lastIds[0]
                : null

        let picked = -1
        if (streakId !== null) {
            // Must pick a different requester to break the streak
            picked = pool.findIndex((t) => requesterId(t) !== streakId)
        }
        if (picked === -1) picked = 0

        result.push(pool[picked])
        pool.splice(picked, 1)
    }

    return result
}
