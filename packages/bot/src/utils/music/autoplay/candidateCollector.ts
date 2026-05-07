import type { Track, GuildQueue } from 'discord-player'
import type { User } from 'discord.js'
import { debugLog } from '@lucky/shared/utils'
import type { SpotifyAudioFeatures } from '../../../spotify/spotifyApi'
import type { SessionMood } from './sessionMood'
import {
    collectSpotifyRecommendationCandidates,
    searchSeedCandidates,
} from './spotifyRecommender'
import {
    calculateRecommendationScore,
    normalizeTrackKey,
} from '../queueManipulation'
import { isDuplicateCandidate } from './diversitySelector'
import { createArtistTagFetcher, hasGenreTag, type ArtistTagFetcher } from './artistTagCache'
import type { ScoredTrack } from './diversitySelector'
export type { ScoredTrack }

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
 *
 * Non-finite scores (e.g. the cross-locale `-Infinity` hard-reject from
 * `calculateRecommendationScore`) are dropped here so callers don't need to
 * remember the in-place guard before every call. Any per-source boost
 * (`+ LASTFM_SCORE_BOOST`, `* match`, `+ GENRE_SCORE_BOOST`) that runs on a
 * `-Infinity` base stays non-finite, so this gate covers the boosted-score
 * caller patterns too.
 */
export function upsertScoredCandidate(
    candidates: Map<string, ScoredTrack>,
    candidate: Track,
    recommendation: { score: number; reason: string },
): void {
    if (!Number.isFinite(recommendation.score)) {
        debugLog({
            message: 'Autoplay hard-reject',
            data: {
                title: candidate.title,
                author: candidate.author,
                score: recommendation.score,
                reason: recommendation.reason,
            },
        })
        return
    }

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
 * - Spotify Recommendations API (based on seed tracks)
 * - Seed track similar searches (YouTube, Spotify)
 *
 * This is the main aggregator that orchestrates Spotify + LastFm + YouTube sourcing.
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
    currentFeatures: SpotifyAudioFeatures | null = null,
    genreContext: {
        getArtistTags?: ArtistTagFetcher
        currentTrackTags?: string[]
        sessionGenreFamilies?: Set<string>
    } = {},
    blockSertanejo = false,
): Promise<Map<string, ScoredTrack>> {
    const candidates = new Map<string, ScoredTrack>()
    const getArtistTags = genreContext.getArtistTags ?? createArtistTagFetcher()
    const currentTrackTags = genreContext.currentTrackTags ?? []
    const sessionGenreFamilies =
        genreContext.sessionGenreFamilies ?? new Set<string>()

    // Collect from Spotify Recommendations API
    await collectSpotifyRecommendationCandidates(
        queue,
        seedTracks,
        requestedBy,
        excludedUrls,
        excludedKeys,
        dislikedWeights,
        likedWeights,
        preferredArtistKeys,
        blockedArtistKeys,
        currentTrack,
        recentArtists,
        candidates,
        autoplayMode,
        artistFrequency,
        implicitDislikeKeys,
        implicitLikeKeys,
        sessionMood,
        currentFeatures,
        { getArtistTags, currentTrackTags, sessionGenreFamilies },
    )

    // Collect from seed track searches (YouTube, Spotify similar)
    for (const seed of seedTracks) {
        const seedCandidates = await searchSeedCandidates(
            queue,
            seed,
            requestedBy,
            replenishCount,
            sessionMood,
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
            const tags = await getArtistTags(candidate.author).catch((err: unknown) => {
                debugLog({ message: 'candidateCollector: getArtistTags failed', data: { author: candidate.author, err } })
                return [] as string[]
            })
            if (blockSertanejo && tags.length > 0 && hasGenreTag(tags, SERTANEJO_TAGS)) {
                continue
            }
            const rec = calculateRecommendationScore({
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
                genreContext: {
                    candidateTags: tags,
                    currentTrackTags,
                    sessionGenreFamilies,
                },
            })
            upsertScoredCandidate(candidates, candidate, rec)
        }
    }

    debugLog({
        message: 'Recommendation candidates collected',
        data: { candidateCount: candidates.size },
    })

    return candidates
}
