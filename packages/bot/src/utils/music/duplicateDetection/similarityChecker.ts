import type { Track } from 'discord-player'
import type { TrackHistoryEntry } from '@lucky/shared/services'
import { levenshteinSimilarity } from '@lucky/shared/utils/similarity'
import type { SimilarityConfig } from './types'

/**
 * Calculate similarity between two strings using Levenshtein distance
 */
export function calculateStringSimilarity(str1: string, str2: string): number {
    return levenshteinSimilarity(str1, str2)
}

/**
 * Check if two tracks are similar based on title and artist
 */
export function areTracksSimilar(
    track1: Track,
    track2: Track | TrackHistoryEntry,
    config: SimilarityConfig,
): boolean {
    const titleSimilarity = calculateStringSimilarity(
        track1.title.toLowerCase(),
        track2.title.toLowerCase(),
    )

    const artistSimilarity = calculateStringSimilarity(
        track1.author.toLowerCase(),
        track2.author.toLowerCase(),
    )

    return (
        titleSimilarity >= config.titleThreshold &&
        artistSimilarity >= config.artistThreshold
    )
}

/**
 * Find similar tracks in history
 */
export function findSimilarTracks(
    track: Track,
    history: TrackHistoryEntry[],
    config: SimilarityConfig,
): TrackHistoryEntry[] {
    return history.filter((historyTrack) =>
        areTracksSimilar(track, historyTrack, config),
    )
}

/**
 * Calculate overall similarity score between two tracks
 */
export function calculateSimilarityScore(
    track1: Track,
    track2: Track | TrackHistoryEntry,
    _config: SimilarityConfig,
): number {
    const titleSimilarity = calculateStringSimilarity(
        track1.title.toLowerCase(),
        track2.title.toLowerCase(),
    )

    const artistSimilarity = calculateStringSimilarity(
        track1.author.toLowerCase(),
        track2.author.toLowerCase(),
    )

    // Weighted average (title is more important)
    return titleSimilarity * 0.7 + artistSimilarity * 0.3
}
