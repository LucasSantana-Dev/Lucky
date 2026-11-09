import type { Track } from 'discord-player'
import { normalizeTrackKey } from './scoringUtils'

export type AnchorSignals = {
    likedWeights: Map<string, number>
    implicitLikeKeys: Set<string>
    implicitDislikeKeys: Set<string>
}

/**
 * A track the session's vibe can be anchored on (#2934): one a person asked
 * for, or an autoplay pick they liked or played through. An early skip
 * (implicit dislike) disqualifies either. Seeding from unvetted picks is what
 * let autoplay drift one pick at a time.
 */
export function isAnchorTrack(track: Track, signals: AnchorSignals): boolean {
    const key = normalizeTrackKey(track.title, track.author)
    if (signals.implicitDislikeKeys.has(key)) return false
    const isAutoplay =
        (track.metadata as { isAutoplay?: boolean } | undefined)?.isAutoplay ===
        true
    if (!isAutoplay) return true
    return (
        (signals.likedWeights.get(key) ?? 0) > 0 ||
        signals.implicitLikeKeys.has(key)
    )
}

/**
 * Most recent anchor tracks, current first, capped at `limit`. Falls back to
 * the current track so the collectors always have a seed.
 */
export function selectAnchorSeeds(
    currentTrack: Track,
    historyTracks: Track[],
    signals: AnchorSignals,
    limit: number,
): Track[] {
    const anchors = [currentTrack, ...historyTracks]
        .filter((t) => isAnchorTrack(t, signals))
        .slice(0, limit)
    return anchors.length > 0 ? anchors : [currentTrack]
}
