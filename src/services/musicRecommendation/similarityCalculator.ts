import type { Track } from 'discord-player'
import type { TrackVector, RecommendationConfig } from './types'
import { calculateCosineSimilarity } from './vectorOperations'

/**
 * Calculate similarity between two tracks based on various factors
 */
export function calculateTrackSimilarity(
    trackA: Track,
    trackB: Track,
    config: RecommendationConfig
): number {
    const similarity = {
        title: calculateTitleSimilarity(trackA.title, trackB.title),
        artist: calculateArtistSimilarity(trackA.author, trackB.author),
        genre: calculateGenreSimilarity(trackA, trackB),
        duration: calculateDurationSimilarity(
            typeof trackA.duration === 'number' ? trackA.duration : parseInt(trackA.duration.toString()),
            typeof trackB.duration === 'number' ? trackB.duration : parseInt(trackB.duration.toString())
        ),
        tags: calculateTagSimilarity(trackA, trackB)
    }

    // Weighted combination
    return (
        similarity.title * 0.2 +
        similarity.artist * config.artistWeight +
        similarity.genre * config.genreWeight +
        similarity.duration * config.durationWeight +
        similarity.tags * config.tagWeight
    )
}

/**
 * Calculate title similarity using string metrics
 */
function calculateTitleSimilarity(titleA: string, titleB: string): number {
    const normalizedA = titleA.toLowerCase().trim()
    const normalizedB = titleB.toLowerCase().trim()

    if (normalizedA === normalizedB) {
        return 1.0
    }

    // Check for common words
    const wordsA = normalizedA.split(/\s+/)
    const wordsB = normalizedB.split(/\s+/)
    const commonWords = wordsA.filter(word => wordsB.includes(word))

    if (commonWords.length === 0) {
        return 0.0
    }

    // Jaccard similarity
    const union = new Set([...wordsA, ...wordsB])
    return commonWords.length / union.size
}

/**
 * Calculate artist similarity
 */
function calculateArtistSimilarity(artistA: string, artistB: string): number {
    const normalizedA = artistA.toLowerCase().trim()
    const normalizedB = artistB.toLowerCase().trim()

    if (normalizedA === normalizedB) {
        return 1.0
    }

    // Check for partial matches (collaborations, etc.)
    if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) {
        return 0.8
    }

    // Check for common words in artist names
    const wordsA = normalizedA.split(/\s+/)
    const wordsB = normalizedB.split(/\s+/)
    const commonWords = wordsA.filter(word => wordsB.includes(word))

    if (commonWords.length > 0) {
        return Math.min(commonWords.length / Math.max(wordsA.length, wordsB.length), 0.6)
    }

    return 0.0
}

/**
 * Calculate genre similarity
 */
function calculateGenreSimilarity(_trackA: Track, _trackB: Track): number {
    // This would need genre extraction from track metadata
    // For now, return a default similarity
    return 0.5
}

/**
 * Calculate duration similarity
 */
function calculateDurationSimilarity(durationA: number, durationB: number): number {
    if (durationA === 0 || durationB === 0) {
        return 0.5
    }

    const ratio = Math.min(durationA, durationB) / Math.max(durationA, durationB)
    return ratio
}

/**
 * Calculate tag similarity
 */
function calculateTagSimilarity(_trackA: Track, _trackB: Track): number {
    // This would need tag extraction from track metadata
    // For now, return a default similarity
    return 0.3
}

/**
 * Calculate vector-based similarity between two track vectors
 */
export function calculateVectorSimilarity(
    vectorA: TrackVector,
    vectorB: TrackVector,
    _config: RecommendationConfig
): number {
    const cosineSim = calculateCosineSimilarity(vectorA.vector, vectorB.vector)

    // Apply genre similarity if available
    let genreBonus = 0
    if (vectorA.genre && vectorB.genre && vectorA.genre === vectorB.genre) {
        genreBonus = 0.2
    }

    return Math.min(cosineSim + genreBonus, 1.0)
}

/**
 * Calculate diversity score for a set of recommendations
 */
export function calculateDiversityScore(
    recommendations: Track[],
    config: RecommendationConfig
): number {
    if (recommendations.length <= 1) {
        return 1.0
    }

    let totalSimilarity = 0
    let comparisons = 0

    for (let i = 0; i < recommendations.length; i++) {
        for (let j = i + 1; j < recommendations.length; j++) {
            const similarity = calculateTrackSimilarity(
                recommendations[i],
                recommendations[j],
                config
            )
            totalSimilarity += similarity
            comparisons++
        }
    }

    const avgSimilarity = comparisons > 0 ? totalSimilarity / comparisons : 0
    return 1.0 - avgSimilarity
}
