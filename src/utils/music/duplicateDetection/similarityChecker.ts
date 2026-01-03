import type { Track } from 'discord-player'
import type { TrackHistoryEntry } from '../../../services/TrackHistoryService'
import type { SimilarityConfig } from './types'

/**
 * Calculate similarity between two strings using Levenshtein distance
 */
export function calculateStringSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2
    const shorter = str1.length > str2.length ? str2 : str1

    if (longer.length === 0) return 1.0

    const distance = levenshteinDistance(longer, shorter)
    return (longer.length - distance) / longer.length
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = Array(str2.length + 1)
        .fill(0)
        .map(() => Array(str1.length + 1).fill(0) as number[])

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j

    for (let j = 1; j <= str2.length; j++) {
        for (let i = 1; i <= str1.length; i++) {
            const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1,
                matrix[j - 1][i] + 1,
                matrix[j - 1][i - 1] + indicator,
            )
        }
    }

    return matrix[str2.length][str1.length]
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
