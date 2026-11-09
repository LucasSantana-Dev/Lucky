import type { Track } from 'discord-player'
import type { AutoplayContext } from './autoplayContext'
import type { ArtistTagFetcher } from './artistTagCache'
import { calculateRecommendationScore } from './candidateScorer'
import { normalizeTrackKey } from './scoringUtils'
import {
    shouldIncludeCandidate,
    upsertScoredCandidate,
} from './candidateCollector'
import type { ScoredTrack } from './diversitySelector'
import type { AutoplayAuditCollector } from './autoplayAudit'

export type SeedDerivedHitOptions = {
    boost: number
    weight: number
    getArtistTags: ArtistTagFetcher
    // Hits that fail this check are skipped before any tag lookup or scoring.
    accept?: (track: Track) => boolean
    // Stop after this many non-vetoed hits. Vetoed hits are still recorded
    // for the audit but do not count, so the next hit gets a chance.
    limit?: number
}

/**
 * Scores search hits for a seed-derived source (seed-similar spine and the
 * related-artist collector) and upserts them as 'seed-similar'. Returns the
 * number of non-vetoed hits added.
 */
export async function addSeedDerivedHits(
    ctx: AutoplayContext,
    tracks: Track[],
    candidates: Map<string, ScoredTrack>,
    options: SeedDerivedHitOptions,
    auditCollector?: AutoplayAuditCollector,
): Promise<number> {
    const { boost, weight, getArtistTags, accept, limit } = options
    let added = 0
    for (const track of tracks) {
        if (limit !== undefined && added >= limit) break
        if (accept && !accept(track)) continue
        if (
            !shouldIncludeCandidate(
                track,
                ctx.excludedUrls,
                ctx.excludedKeys,
                candidates,
            )
        )
            continue
        const dislikedWeight = ctx.dislikedWeights.get(
            normalizeTrackKey(track.title, track.author),
        )
        if (dislikedWeight !== undefined && dislikedWeight > 0.5) continue
        const rec = calculateRecommendationScore({
            candidate: track,
            currentTrack: ctx.currentTrack,
            recentArtists: ctx.recentArtists,
            likedWeights: ctx.likedWeights,
            likedArtistWeights: ctx.likedArtistWeights,
            dislikedArtistWeights: ctx.dislikedArtistWeights,
            preferredArtistKeys: ctx.preferredArtistKeys,
            blockedArtistKeys: ctx.blockedArtistKeys,
            autoplayMode: ctx.autoplayMode,
            artistFrequency: ctx.artistFrequency,
            recentArtistIndices: ctx.recentArtistIndices,
            seedArtistStreak: ctx.seedArtistStreak,
            implicitDislikeKeys: ctx.implicitDislikeKeys,
            implicitLikeKeys: ctx.implicitLikeKeys,
            dislikedWeights: ctx.dislikedWeights,
            sessionMood: ctx.sessionMood,
            skipNoveltyBoost: true,
            // Seed-derived: relax the genre guards to the safe radius around
            // the seed so related-but-different artists aren't scored out.
            seedDerived: true,
            genreContext: {
                candidateTags: await getArtistTags(track.author),
                currentTrackTags: ctx.genreContext.currentTrackTags ?? [],
                sessionGenreFamilies:
                    ctx.genreContext.sessionGenreFamilies ?? new Set<string>(),
            },
            replayFrequentTrackIds: ctx.replayFrequentTrackIds,
            replayFrequentArtists: ctx.replayFrequentArtists,
        })
        // Count only stored hits: a higher-scored copy already in the pool
        // must not use up this pick's limit.
        const stored = upsertScoredCandidate(
            candidates,
            track,
            {
                score: (rec.score + boost) * weight,
                source: 'seed-similar',
                signals: rec.signals,
                veto: rec.veto,
            },
            auditCollector,
        )
        if (stored && !rec.veto) added++
    }
    return added
}
