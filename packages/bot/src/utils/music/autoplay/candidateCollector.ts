import type { Track, GuildQueue } from 'discord-player'
import type { User } from 'discord.js'
import { debugLog } from '@lucky/shared/utils'
import type { SpotifyAudioFeatures } from '../../../spotify/spotifyApi'
import type { SessionMood } from './sessionMood'
import type { AutoplayContext } from './autoplayContext'
import {
    collectSpotifyRecommendationCandidates,
    searchSeedCandidates,
} from './spotifyRecommender'
import { calculateRecommendationScore } from './candidateScorer'
import { normalizeTrackKey } from './scoringUtils'
import {
    shouldIncludeCandidate,
    upsertScoredCandidate,
} from './candidateContracts'
import {
    createArtistTagFetcher,
    hasGenreTag,
    type ArtistTagFetcher,
} from './artistTagCache'
import type { ScoredTrack } from './diversitySelector'
import type { AutoplayAuditCollector } from './autoplayAudit'
import type {
    RecommendationBasis,
    RecommendationSource,
    RecommendationSignal,
} from './recommendationBasis.js'
import { serializeBasis } from './recommendationBasis.js'

export type { ScoredTrack }
export type {
    RecommendationBasis,
    RecommendationSource,
    RecommendationSignal,
} from './recommendationBasis.js'
export {
    shouldIncludeCandidate,
    upsertScoredCandidate,
} from './candidateContracts'

export const SERTANEJO_TAGS = [
    'sertanejo',
    'sertanejo universitário',
    'sertanejo pop',
    'música sertaneja',
    'forró',
]

/**
 * Include a candidate in the pool if it hasn't been played recently
 * and isn't in the disliked set.
 */

/**
 * Add or update a candidate in the scored pool.
 * Keeps the higher-scored version if a duplicate key exists.
 *
 * Non-finite scores (e.g. the cross-locale `-Infinity` hard-reject from
 * `calculateRecommendationScore`) are dropped here so callers don't need to
 * remember the in-place guard before every call. Any per-source boost
 * (`+ LASTFM_SCORE_BOOST`, `* match`, `+ GENRE_SCORE_BOOST`) that runs on a
 * `-Infinity` base stays non-finite, so this gate covers the boosted-score
 * caller patterns too.
 */

/**
 * Collect recommendation candidates from multiple sources:
 * - Spotify Recommendations API (based on seed tracks)
 * - Seed track similar searches (YouTube, Spotify)
 *
 * This is the main aggregator that orchestrates Spotify + LastFm + YouTube sourcing.
 * Last.fm is handled separately by collectLastFmCandidates in _replenishQueue.
 */
export async function collectRecommendationCandidates(
    ctx: AutoplayContext,
    seedTracks: Track[],
    requestedBy: User | null,
    replenishCount = 0,
    currentFeatures: SpotifyAudioFeatures | null = null,
    blockSertanejo = false,
): Promise<Map<string, ScoredTrack>> {
    const candidates = new Map<string, ScoredTrack>()
    const getArtistTags =
        ctx.genreContext.getArtistTags ?? createArtistTagFetcher()
    const currentTrackTags = ctx.genreContext.currentTrackTags ?? []
    const sessionGenreFamilies =
        ctx.genreContext.sessionGenreFamilies ?? new Set<string>()

    // Collect from Spotify Recommendations API
    await collectSpotifyRecommendationCandidates(
        ctx,
        seedTracks,
        requestedBy,
        candidates,
        currentFeatures,
    )

    // Collect from seed track searches (Spotify only — no YouTube fallback to
    // avoid language-drift where genre terms like "worship" cause YouTube's
    // algorithm to surface Spanish gospel on non-Spanish sessions)
    for (const seed of seedTracks) {
        const seedCandidates = await searchSeedCandidates(
            ctx.queue,
            seed,
            requestedBy,
        )
        for (const candidate of seedCandidates) {
            if (
                !shouldIncludeCandidate(
                    candidate,
                    ctx.excludedUrls,
                    ctx.excludedKeys,
                )
            ) {
                continue
            }
            const normalizedKey = normalizeTrackKey(
                candidate.title,
                candidate.author,
            )
            const dislikedWeight = ctx.dislikedWeights.get(normalizedKey)
            if (dislikedWeight !== undefined && dislikedWeight > 0.5) {
                continue
            }
            const tags = await getArtistTags(candidate.author).catch(
                (err: unknown) => {
                    debugLog({
                        message: 'candidateCollector: getArtistTags failed',
                        data: { author: candidate.author, err },
                    })
                    return [] as string[]
                },
            )
            if (
                blockSertanejo &&
                tags.length > 0 &&
                hasGenreTag(tags, SERTANEJO_TAGS)
            ) {
                continue
            }
            const rec = calculateRecommendationScore({
                candidate,
                currentTrack: ctx.currentTrack,
                recentArtists: ctx.recentArtists,
                likedWeights: ctx.likedWeights,
                preferredArtistKeys: ctx.preferredArtistKeys,
                blockedArtistKeys: ctx.blockedArtistKeys,
                autoplayMode: ctx.autoplayMode,
                artistFrequency: ctx.artistFrequency,
                implicitDislikeKeys: ctx.implicitDislikeKeys,
                implicitLikeKeys: ctx.implicitLikeKeys,
                dislikedWeights: ctx.dislikedWeights,
                sessionMood: ctx.sessionMood,
                genreContext: {
                    candidateTags: tags,
                    currentTrackTags,
                    sessionGenreFamilies,
                },
            })
            upsertScoredCandidate(candidates, candidate, {
                score: rec.score,
                source: 'spotify-rec',
                signals: rec.signals,
            })
        }
    }

    debugLog({
        message: 'Recommendation candidates collected',
        data: { candidateCount: candidates.size },
    })

    return candidates
}
