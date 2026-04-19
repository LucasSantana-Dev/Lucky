import type { Track, GuildQueue } from 'discord-player'
import type { User } from 'discord.js'
import { debugLog } from '@lucky/shared/utils'
import type { SessionMood } from './sessionMood'
import {
    searchSeedCandidates,
} from './spotifyRecommender'
import {
    calculateRecommendationScore,
    normalizeTrackKey,
} from '../queueManipulation'
import { isDuplicateCandidate } from './diversitySelector'

export type ScoredTrack = {
    track: Track
    score: number
    reason: string
}

/**
 * Include a candidate in the pool if it hasn't been played recently
 * and isn't in the disliked set.
 */
export function shouldIncludeCandidate(
    track: Track,
    excludedUrls: Set<string>,
    excludedKeys: Set<string>,
): boolean {
    return !isDuplicateCandidate(track, excludedUrls, excludedKeys)
}

/**
 * Add or update a candidate in the scored pool.
 * Keeps the higher-scored version if a duplicate key exists.
 */
export function upsertScoredCandidate(
    candidates: Map<string, ScoredTrack>,
    candidate: Track,
    recommendation: { score: number; reason: string },
): void {
    const normalizedKey = normalizeTrackKey(candidate.title, candidate.author)
    const candidateKey =
        normalizedKey !== '::' ? normalizedKey : (candidate.id || candidate.url || normalizeTrackKey(candidate.title, candidate.author))
    const existing = candidates.get(candidateKey)

    if (!existing || recommendation.score > existing.score) {
        candidates.set(candidateKey, {
            track: candidate,
            score: recommendation.score,
            reason: recommendation.reason,
        })
    }
}

/**
 * Collect recommendation candidates from multiple sources:
 * - Seed track similar searches (YouTube, Spotify)
 *
 * This is the main aggregator that orchestrates LastFm + YouTube sourcing.
 * Last.fm is handled separately by collectLastFmCandidates in _replenishQueue.
 */
export async function collectRecommendationCandidates(
    queue: GuildQueue,
    seedTracks: Track[],
    requestedBy: User | null,
    excludedUrls: Set<string>,
    excludedKeys: Set<string>,
    dislikedWeights: Map<string, number>,
    likedWeights: Map<string, number>,
    preferredArtistKeys: Set<string>,
    blockedArtistKeys: Set<string>,
    currentTrack: Track,
    recentArtists: Set<string>,
    replenishCount = 0,
    autoplayMode: 'similar' | 'discover' | 'popular' = 'similar',
    artistFrequency: Map<string, number> = new Map(),
    implicitDislikeKeys: Set<string> = new Set(),
    implicitLikeKeys: Set<string> = new Set(),
    sessionMood: SessionMood | null = null,
): Promise<Map<string, ScoredTrack>> {
    const candidates = new Map<string, ScoredTrack>()

    // Collect from seed track searches (YouTube, Spotify similar)
    for (const seed of seedTracks) {
        const seedCandidates = await searchSeedCandidates(
            queue,
            seed,
            requestedBy,
            replenishCount,
        )
        for (const candidate of seedCandidates) {
            if (
                !shouldIncludeCandidate(candidate, excludedUrls, excludedKeys)
            ) {
                continue
            }
            const normalizedKey = normalizeTrackKey(
                candidate.title,
                candidate.author,
            )
            const dislikedWeight = dislikedWeights.get(normalizedKey)
            if (dislikedWeight !== undefined && dislikedWeight > 0.5) {
                continue
            }
            const rec = calculateRecommendationScore(
                candidate,
                currentTrack,
                recentArtists,
                likedWeights,
                preferredArtistKeys,
                blockedArtistKeys,
                autoplayMode,
                artistFrequency,
                implicitDislikeKeys,
                implicitLikeKeys,
                dislikedWeights,
                sessionMood,
            )
            if (rec.score !== -Infinity) {
                upsertScoredCandidate(candidates, candidate, rec)
            }
        }
    }

    debugLog({
        message: 'Recommendation candidates collected',
        data: { candidateCount: candidates.size },
    })

    return candidates
}
