import type { Track } from 'discord-player'
import { LRUCache } from 'lru-cache'
import { infoLog } from '@lucky/shared/utils'
import { normalizeTrackKey } from '../../services/musicRecommendation/autoplay/scoringUtils'
import { recommendationFeedbackService } from '../../services/musicRecommendation/feedbackService'

// Autoplay recommendation outcome threshold: a track played past this fraction
// is "accepted"; ended/skipped before it is "rejected" (symmetric across the
// playerFinish + playerSkip paths). Tune via Phase C data.
export const OUTCOME_ACCEPT_PLAY_RATIO = 0.3

// Start time per TRACK INSTANCE — not per guild, and not per track id.
//
// Autoplay track lifecycles overlap: discord-player can emit the next track's
// playerStart before the previous track's playerFinish/playerSkip. A single
// per-guild timestamp gets clobbered by that interleaving, making
// completionRatio ≈ 0 for the wrong track and corrupting the accept/reject
// classification (#1275). Keying by `guildId::trackId` had the same problem one
// level down, because the same track can be in flight twice (#2298).
//
// The track object is the only identifier that is genuinely unique per play:
// discord-player emits the same Track instance through
// playerStart/playerFinish/playerSkip (verified in discord-player's dist —
// GuildQueue #performStart at :5870, finish path at :5904). Keying a WeakMap on
// it needs no TTL, no size cap and no manual cleanup: an entry becomes
// unreachable when its track does. It also cannot collide, which a key built
// from a timestamp can when two plays start inside the same millisecond.
//
// #2334: repeat modes re-dispatch the SAME Track instance from history, so a
// repeat replay reuses this key. A single stored value per track can't tell
// two overlapping plays of that instance apart: if the next repeat's start
// fires before the previous play's finish is read, the second start
// overwrites the first and that finish reads the wrong timestamp. Each track
// instead gets a small FIFO queue of start times, one per in-flight play,
// since plays of a given track can only start in the order they are dispatched.
// takeTrackPlayStart removes and returns the oldest entry in one step, so each
// finish or skip consumes exactly one play's start time and two overlapping
// plays cannot collide.
// Not exported directly: it is reassigned by the test reset below, and an
// exported binding captured by an importer would go on pointing at the old map.
let trackPlayStartTimes = new WeakMap<Track, number[]>()

export function setTrackPlayStart(track: Track, startedAt: number): void {
    const queue = trackPlayStartTimes.get(track)
    if (queue) {
        queue.push(startedAt)
    } else {
        trackPlayStartTimes.set(track, [startedAt])
    }
}

/**
 * Removes and returns the oldest start time for this track, in one synchronous
 * step. Reading and removing has to be atomic from a caller's point of view:
 * the terminal handlers await scrobble and history work, so a separate read and
 * a separate clear across that await let two overlapping plays of one track
 * take the same entry, or take each other's. Call this at handler entry, before
 * any await, and carry the value through.
 */
export function takeTrackPlayStart(track: Track): number | undefined {
    const queue = trackPlayStartTimes.get(track)
    if (!queue?.length) return undefined
    const startedAt = queue.shift()
    if (queue.length === 0) trackPlayStartTimes.delete(track)
    return startedAt
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
    guildRecentSkipCounts.clear()
    // A WeakMap has no clear(), so drop the whole map. Tests rely on this to
    // simulate a start time being lost before its finish event arrives.
    trackPlayStartTimes = new WeakMap<Track, number[]>()
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
