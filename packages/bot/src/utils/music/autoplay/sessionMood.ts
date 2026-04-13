export interface SessionMood {
    deepDiveArtist: string | null
    preferLong: boolean
    preferShort: boolean
    restless: boolean
}

function parseDurationString(durationStr: string | undefined): number {
    if (!durationStr || typeof durationStr !== 'string') return 0

    const parts = durationStr.split(':').map((p) => Number.parseInt(p, 10))
    if (parts.length === 0 || parts.some((p) => Number.isNaN(p))) return 0

    if (parts.length === 2) {
        return (parts[0] * 60 + parts[1]) * 1000
    }
    if (parts.length === 3) {
        return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000
    }

    return 0
}

function getDurationMs(track: {
    durationMS?: number
    duration?: string
}): number {
    if (track.durationMS && track.durationMS > 0) {
        return track.durationMS
    }
    if (track.duration) {
        return parseDurationString(track.duration)
    }
    return 0
}

export function detectSessionMood(
    historyTracks: {
        author?: string
        durationMS?: number
        duration?: string
        isAutoplay?: boolean
    }[],
): SessionMood {
    if (historyTracks.length === 0) {
        return {
            deepDiveArtist: null,
            preferLong: false,
            preferShort: false,
            restless: false,
        }
    }

    // Artist deep-dive: same artist 3+ times in last 8 tracks
    let deepDiveArtist: string | null = null
    const recentForDeepDive = historyTracks.slice(-8)
    const artistCounts = new Map<string, number>()
    for (const track of recentForDeepDive) {
        if (track.author) {
            const artist = track.author.toLowerCase()
            artistCounts.set(artist, (artistCounts.get(artist) ?? 0) + 1)
        }
    }
    for (const [artist, count] of artistCounts) {
        if (count >= 3) {
            deepDiveArtist = artist
            break
        }
    }

    // Duration preference: last 5 tracks
    let preferLong = false
    let preferShort = false
    const recentForDuration = historyTracks.slice(-5)
    if (recentForDuration.length >= 1) {
        const durations = recentForDuration
            .map((t) => getDurationMs(t))
            .filter((d) => d > 0)

        if (durations.length >= 1) {
            const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length
            if (avgDuration > 5 * 60 * 1000) {
                preferLong = true
            } else if (avgDuration < 2.5 * 60 * 1000) {
                preferShort = true
            }
        }
    }

    // Restless mode: >40% autoplay AND multiple different artists in recent
    let restless = false
    const recentForRestless = historyTracks.slice(-10)
    if (recentForRestless.length >= 5) {
        const autoplayCount = recentForRestless.filter(
            (t) => t.isAutoplay === true,
        ).length
        const autoplayRatio = autoplayCount / recentForRestless.length
        const uniqueArtists = new Set(
            recentForRestless
                .map((t) => t.author?.toLowerCase())
                .filter(Boolean),
        )
        if (autoplayRatio > 0.4 && uniqueArtists.size >= 3) {
            restless = true
        }
    }

    return {
        deepDiveArtist,
        preferLong,
        preferShort,
        restless,
    }
}
