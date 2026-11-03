import type { GuildQueue, Track } from 'discord-player'
import { recommendationFeedbackService } from '../../services/musicRecommendation/feedbackService'
import { normalizeTrackKey } from '../../services/musicRecommendation/autoplay/scoringUtils'
import { clearSessionMoodCache } from '../../services/musicRecommendation/autoplay/replenisher'
import { isRecommendationAutoplay } from './autoplayOutcomeTracking'

function listenerIds(queue: GuildQueue): string[] {
    return queue.channel
        ? [...queue.channel.members.values()]
              .filter((member) => !member.user.bot)
              .map((member) => member.id)
        : []
}

// The room rejected an autoplay pick: the track, and its artist at a share of
// `strength`, become implicit dislikes for the guild and every listener in the
// channel (#2933).
export function rejectAutoplayPick(
    queue: GuildQueue,
    track: Track,
    strength: number,
): void {
    recommendationFeedbackService.recordAutoplayRejection(
        queue.guild.id,
        listenerIds(queue),
        track,
        strength,
    )
    clearSessionMoodCache(queue.guild.id)
}

// Picks already buffered were scored before the rejection; drop the ones by
// the rejected artist so the next refill replaces them.
export function dropQueuedAutoplayPicksByArtist(
    queue: GuildQueue,
    track: Track,
): void {
    const artistOf = (t: Track) =>
        normalizeTrackKey(t.title, t.author).split('::')[1]
    const artist = artistOf(track)
    if (!artist) return
    for (const queued of queue.tracks.toArray()) {
        if (isRecommendationAutoplay(queued) && artistOf(queued) === artist) {
            queue.removeTrack(queued)
        }
    }
}
