import type { Track } from 'discord-player'
import type { RecommendationResult, RecommendationConfig, UserPreferenceSeed } from './types'
import { calculateTrackSimilarity, calculateDiversityScore } from './similarityCalculator'
import { createTrackVector, calculateVectorSimilarity } from './vectorOperations'
import { errorLog } from '../../utils/general/log'

/**
 * Generate recommendations based on a seed track
 */
export async function generateRecommendations(
    seedTrack: Track,
    availableTracks: Track[],
    config: RecommendationConfig,
    excludeTrackIds: string[] = []
): Promise<RecommendationResult[]> {
    try {
        const seedVector = createTrackVector(seedTrack)
        const recommendations: RecommendationResult[] = []

        for (const track of availableTracks) {
            if (excludeTrackIds.includes(track.id || track.url)) {
                continue
            }

            const similarity = calculateTrackSimilarity(seedTrack, track, config)

            if (similarity >= config.similarityThreshold) {
                const trackVector = createTrackVector(track)
                const vectorSimilarity = calculateVectorSimilarity(seedVector, trackVector, config)

                const finalScore = (similarity + vectorSimilarity) / 2

                recommendations.push({
                    track,
                    score: finalScore,
                    reasons: generateRecommendationReasons(seedTrack, track, similarity, vectorSimilarity)
                })
            }
        }

        // Sort by score and apply diversity
        recommendations.sort((a, b) => b.score - a.score)

        // Apply diversity factor
        const diverseRecommendations = applyDiversityFilter(
            recommendations,
            config
        )

        return diverseRecommendations.slice(0, config.maxRecommendations)
    } catch (error) {
        errorLog({ message: 'Error generating recommendations:', error })
        return []
    }
}

/**
 * Generate recommendations based on user preferences
 */
export async function generateUserPreferenceRecommendations(
    preferences: UserPreferenceSeed,
    availableTracks: Track[],
    config: RecommendationConfig,
    excludeTrackIds: string[] = []
): Promise<RecommendationResult[]> {
    try {
        const virtualSeed = createUserPreferenceSeed(preferences)
        return generateRecommendations(virtualSeed, availableTracks, config, excludeTrackIds)
    } catch (error) {
        errorLog({ message: 'Error generating user preference recommendations:', error })
        return []
    }
}

/**
 * Generate recommendations based on listening history
 */
export async function generateHistoryBasedRecommendations(
    recentHistory: Track[],
    availableTracks: Track[],
    config: RecommendationConfig,
    excludeTrackIds: string[] = []
): Promise<RecommendationResult[]> {
    try {
        if (recentHistory.length === 0) {
            return []
        }

        // Use the most recent track as primary seed
        const primarySeed = recentHistory[0]
        const primaryRecommendations = await generateRecommendations(
            primarySeed,
            availableTracks,
            config,
            excludeTrackIds
        )

        // If we have more history, blend with other recent tracks
        if (recentHistory.length > 1) {
            const blendedRecommendations = await blendRecommendations(
                primaryRecommendations,
                recentHistory.slice(1, 5), // Use up to 4 additional tracks
                availableTracks,
                config,
                excludeTrackIds
            )
            return blendedRecommendations
        }

        return primaryRecommendations
    } catch (error) {
        errorLog({ message: 'Error generating history-based recommendations:', error })
        return []
    }
}

/**
 * Create a virtual seed track from user preferences
 */
function createUserPreferenceSeed(preferences: UserPreferenceSeed): Track {
    return {
        id: 'virtual-seed',
        title: `User Preference Mix`,
        author: preferences.artists[0] || 'Various Artists',
        duration: preferences.avgDuration * 1000, // Convert to milliseconds
        url: '',
        thumbnail: '',
        description: `Based on ${preferences.genres[0] || 'various'} music preferences`,
        views: 0,
        requestedBy: null,
        source: 'virtual' as 'youtube' | 'spotify' | 'soundcloud' | 'attachment',
        raw: {} as Record<string, unknown>,
        metadata: {
            source: 'virtual',
            engine: 'preferences'
        }
    } as unknown as Track
}

/**
 * Blend recommendations from multiple seed tracks
 */
async function blendRecommendations(
    primaryRecommendations: RecommendationResult[],
    additionalSeeds: Track[],
    availableTracks: Track[],
    config: RecommendationConfig,
    excludeTrackIds: string[]
): Promise<RecommendationResult[]> {
    const allRecommendations = new Map<string, RecommendationResult>()

    // Add primary recommendations
    for (const rec of primaryRecommendations) {
        const key = rec.track.id || rec.track.url
        allRecommendations.set(key, rec)
    }

    // Add recommendations from additional seeds
    for (const seed of additionalSeeds) {
        const seedRecommendations = await generateRecommendations(
            seed,
            availableTracks,
            config,
            excludeTrackIds
        )

        for (const rec of seedRecommendations) {
            const key = rec.track.id || rec.track.url
            const existing = allRecommendations.get(key)

            if (existing) {
                // Blend scores
                existing.score = (existing.score + rec.score) / 2
                existing.reasons.push(...rec.reasons)
            } else {
                allRecommendations.set(key, rec)
            }
        }
    }

    return Array.from(allRecommendations.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, config.maxRecommendations)
}

/**
 * Apply diversity filter to recommendations
 */
function applyDiversityFilter(
    recommendations: RecommendationResult[],
    config: RecommendationConfig
): RecommendationResult[] {
    if (recommendations.length <= 1 || config.diversityFactor <= 0) {
        return recommendations
    }

    const diverseRecommendations: RecommendationResult[] = []
    const usedTracks = new Set<string>()

    for (const rec of recommendations) {
        const trackKey = rec.track.id || rec.track.url

        if (usedTracks.has(trackKey)) {
            continue
        }

        // Check diversity with already selected tracks
        const currentTracks = diverseRecommendations.map(r => r.track)
        const diversityScore = calculateDiversityScore([...currentTracks, rec.track], config)

        if (diversityScore >= config.diversityFactor) {
            diverseRecommendations.push(rec)
            usedTracks.add(trackKey)
        }
    }

    return diverseRecommendations
}

/**
 * Generate human-readable reasons for a recommendation
 */
function generateRecommendationReasons(
    seedTrack: Track,
    recommendedTrack: Track,
    similarity: number,
    vectorSimilarity: number
): string[] {
    const reasons: string[] = []

    if (similarity > 0.8) {
        reasons.push('Very similar to your current track')
    } else if (similarity > 0.6) {
        reasons.push('Similar style to your current track')
    }

    if (vectorSimilarity > 0.7) {
        reasons.push('Matches your listening patterns')
    }

    if (seedTrack.author === recommendedTrack.author) {
        reasons.push('Same artist')
    }

    const seedDuration = typeof seedTrack.duration === 'number' ? seedTrack.duration : parseInt(seedTrack.duration.toString())
    const recommendedDuration = typeof recommendedTrack.duration === 'number' ? recommendedTrack.duration : parseInt(recommendedTrack.duration.toString())
    if (Math.abs(seedDuration - recommendedDuration) < 30000) {
        reasons.push('Similar duration')
    }

    return reasons.length > 0 ? reasons : ['Recommended based on your preferences']
}
