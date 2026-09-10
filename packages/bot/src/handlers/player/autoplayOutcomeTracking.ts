import type { Track } from 'discord-player'
import { LRUCache } from 'lru-cache'
import { infoLog } from '@lucky/shared/utils'
import { normalizeTrackKey } from '../../services/musicRecommendation/autoplay/scoringUtils'
import { recommendationFeedbackService } from '../../services/musicRecommendation/feedbackService'

// Autoplay recommendation outcome threshold: a track played past this fraction
// is "accepted"; ended/skipped before it is "rejected" (symmetric across the
// playerFinish + playerSkip paths). Tune via Phase C data.
export const OUTCOME_ACCEPT_PLAY_RATIO = 0.3

// Keyed per TRACK INSTANCE (guildId + track id + play-specific identity), not per guild:
// autoplay track lifecycles overlap — discord-player can emit the next track's playerStart
// before the previous track's playerFinish/playerSkip. A single per-guild timestamp gets
// clobbered by that interleaving, making completionRatio ≈ 0 for the wrong track and
// corrupting the accept/reject classification (#1275).
// Further, the same track repeated (same guildId + trackId, different play) must have
// distinct cache entries per play instance, so one play's start time doesn't overwrite
// another's (#2298). We use a WeakMap keyed on the track object itself, which is unique
// per play instance in discord-player's event model.
export const trackStartTimes = new LRUCache<string, number>({
    max: 500,
    ttl: 30 * 60 * 1000,
    updateAgeOnGet: true,
})

// WeakMap from track object instance to its start time. Keyed on track object identity
// (not track id or string), so repeated plays of the same track have separate entries.
// Track objects are garbage-collectable after play ends, so no manual cleanup needed.
export const trackPlayStartTime = new WeakMap<Track, number>()

export const trackStartKey = (
    guildId: string,
    trackId: string,
    track?: Track,
): string => {
    if (track !== undefined) {
        const startTime = trackPlayStartTime.get(track)
        if (startTime !== undefined) {
            return `${guildId}::${trackId}::${startTime}`
        }
    }
    // Fallback (should not happen in normal flow): return base key
    return `${guildId}::${trackId}`
}

function classifyOutcome(
    playedRatio: number | null,
    path: 'finish' | 'skip',
): string {
    if (playedRatio === null) return 'none(no-timing)'
    if (playedRatio < OUTCOME_ACCEPT_PLAY_RATIO) return 'rejected'
    return path === 'finish' ? 'accepted' : 'ambiguous(dropped)'
}

export const guildRecentSkipCounts = new LRUCache<string, number>({
    max: 500,
    ttl: 30 * 60 * 1000,
    updateAgeOnGet: true,
})

export function getRecentSkipCount(guildId: string): number {
    return guildRecentSkipCounts.get(guildId) ?? 0
}

export function __resetTrackHandlerCachesForTests(): void {
    trackStartTimes.clear()
    guildRecentSkipCounts.clear()
    // WeakMap has no clear(), so we can't reset it; tests must create fresh track instances
}

export function getTrackRequesterId(track: Track): string | undefined {
    const metadata = track.metadata as { requestedById?: string } | undefined
    return track.requestedBy?.id ?? metadata?.requestedById
}

export function isAutoplayTrack(track: Track, clientUserId?: string): boolean {
    const metadata = track.metadata as { isAutoplay?: boolean } | undefined
    return (
        metadata?.isAutoplay === true ||
        (clientUserId !== undefined && track.requestedBy?.id === clientUserId)
    )
}

export function isRecommendationAutoplay(track: Track): boolean {
    const metadata = track.metadata as { isAutoplay?: boolean } | undefined
    return metadata?.isAutoplay === true
}

export async function recordImplicitTrackFeedback(
    track: Track,
    type: 'implicit_like' | 'implicit_dislike',
): Promise<void> {
    const requesterId =
        track.requestedBy?.id ??
        (track.metadata as { requestedById?: string } | undefined)
            ?.requestedById
    if (!requesterId) return
    const trackKey = normalizeTrackKey(track.title, track.author)
    await recommendationFeedbackService.recordImplicitFeedback(
        requesterId,
        trackKey,
        type,
    )
}

// #1275 diagnostic: the per-event accept/reject logic is correct and
// unit-tested (incl. the interleaving probe), yet prod records 0 rejected.
// The existing "Track skipped" log lacks the fields to tell a code issue
// (missing start time, skips routing through playerFinish, the real skipRatio
// distribution) from a genuinely-rare signal (most picks are over-queued and
// never played → 'pending'). Emit the decision inputs for every autoplay
// terminal event, on both paths, so Loki can disambiguate H1 vs H2.
export const logAutoplayOutcomeEval = (
    path: 'finish' | 'skip',
    queue: { guild: { id: string } },
    track: Track,
    startTime: number | undefined,
): void => {
    const playedRatio =
        startTime !== undefined && track.durationMS
            ? (Date.now() - startTime) / track.durationMS
            : null
    const recordedOutcome = classifyOutcome(playedRatio, path)
    infoLog({
        message: 'Autoplay outcome eval',
        data: {
            path,
            guildId: queue.guild.id,
            trackId: track.id,
            hasStartTime: startTime !== undefined,
            durationMS: track.durationMS ?? null,
            playedRatio:
                playedRatio === null
                    ? null
                    : Math.round(playedRatio * 1000) / 1000,
            recordedOutcome,
        },
    })
}
