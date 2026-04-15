import type { Track } from 'discord-player'
import type {
    RecommendationResult,
    RecommendationConfig,
    UserPreferenceSeed,
} from './types'
import { calculateTrackSimilarity } from './similarityCalculator'
import {
    createTrackVector,
    calculateVectorSimilarity,
} from './vectorOperations'
import { errorLog } from '@lucky/shared/utils'
import {
    createUserPreferenceSeed,
    applyDiversityFilter,
    generateRecommendationReasons,
} from './recommendationHelpers'
import {
    detectSpanishMarkers,
    detectSessionLanguageMarkers,
} from '../../utils/music/languageHeuristics'

type TrackMetadata = {
    tags?: string[]
    popularity?: number
}

export async function generateRecommendations(
    seedTrack: Track,
    availableTracks: Track[],
    config: RecommendationConfig,
    excludeTrackIds: string[] = [],
): Promise<RecommendationResult[]> {
    try {
        const seedVector = createTrackVector(seedTrack)
        const recommendations: RecommendationResult[] = []

        for (const track of availableTracks) {
            if (excludeTrackIds.includes(track.id || track.url)) continue
            const similarity = calculateTrackSimilarity(
                seedTrack,
                track,
                config,
            )
            if (similarity >= config.similarityThreshold) {
                const trackVector = createTrackVector(track)
                const vectorSimilarity = calculateVectorSimilarity(
                    seedVector,
                    trackVector,
                    config,
                )
                const finalScore = (similarity + vectorSimilarity) / 2
                recommendations.push({
                    track,
                    score: finalScore,
                    reasons: generateRecommendationReasons(
                        seedTrack,
                        track,
                        similarity,
                        vectorSimilarity,
                    ),
                })
            }
        }

        recommendations.sort((a, b) => b.score - a.score)
        return applyDiversityFilter(recommendations, config).slice(
            0,
            config.maxRecommendations,
        )
    } catch (error) {
        errorLog({ message: 'Error generating recommendations:', error })
        return []
    }
}

export async function generateUserPreferenceRecommendations(
    preferences: UserPreferenceSeed,
    availableTracks: Track[],
    config: RecommendationConfig,
    excludeTrackIds: string[] = [],
): Promise<RecommendationResult[]> {
    try {
        const virtualSeed = createUserPreferenceSeed(preferences)
        return generateRecommendations(
            virtualSeed,
            availableTracks,
            config,
            excludeTrackIds,
        )
    } catch (error) {
        errorLog({
            message: 'Error generating user preference recommendations:',
            error,
        })
        return []
    }
}

export async function generateHistoryBasedRecommendations(
    recentHistory: Track[],
    availableTracks: Track[],
    config: RecommendationConfig,
    excludeTrackIds: string[] = [],
): Promise<RecommendationResult[]> {
    try {
        if (recentHistory.length === 0) return []

        const sessionLanguageMarkers = detectSessionLanguageMarkers(
            recentHistory.map((t) => ({
                title: t.title,
                author: t.author,
                tags: (t.metadata as TrackMetadata)?.tags || [],
            })),
        )

        const primarySeed = recentHistory[0]
        const primaryRecommendations = await generateRecommendations(
            primarySeed,
            availableTracks,
            config,
            excludeTrackIds,
        )

        const filtered = applySpanishLanguagePenalty(
            primaryRecommendations,
            sessionLanguageMarkers.hasSpanish,
        )

        if (recentHistory.length > 1) {
            return blendRecommendations(
                filtered,
                recentHistory.slice(1, 5),
                availableTracks,
                config,
                excludeTrackIds,
                sessionLanguageMarkers.hasSpanish,
            )
        }
        return filtered
    } catch (error) {
        errorLog({
            message: 'Error generating history-based recommendations:',
            error,
        })
        return []
    }
}

function applySpanishLanguagePenalty(
    recommendations: RecommendationResult[],
    hasSpanishMarkers: boolean,
): RecommendationResult[] {
    return recommendations.map((rec) => {
        const trackText = `${rec.track.title || ''} ${rec.track.author || ''}`
        const candidateHasSpanish = detectSpanishMarkers(
            trackText,
            (rec.track.metadata as TrackMetadata)?.tags || [],
        )

        if (candidateHasSpanish && !hasSpanishMarkers) {
            return {
                ...rec,
                score: -2.0,
                reasons: [
                    ...rec.reasons,
                    'Rejected: Spanish track in non-Spanish session',
                ],
            }
        }

        if (
            candidateHasSpanish &&
            !hasSpanishMarkers &&
            ((rec.track.metadata as TrackMetadata)?.popularity || 100) < 20
        ) {
            return {
                ...rec,
                score: rec.score - 0.4,
                reasons: [
                    ...rec.reasons,
                    'Low popularity + disjoint genre',
                ],
            }
        }

        return rec
    })
}

async function blendRecommendations(
    primaryRecommendations: RecommendationResult[],
    additionalSeeds: Track[],
    availableTracks: Track[],
    config: RecommendationConfig,
    excludeTrackIds: string[],
    hasSpanishMarkers: boolean = false,
): Promise<RecommendationResult[]> {
    const allRecommendations = new Map<string, RecommendationResult>()
    for (const rec of primaryRecommendations) {
        allRecommendations.set(rec.track.id || rec.track.url, rec)
    }
    for (const seed of additionalSeeds) {
        const seedRecs = await generateRecommendations(
            seed,
            availableTracks,
            config,
            excludeTrackIds,
        )
        const filtered = applySpanishLanguagePenalty(seedRecs, hasSpanishMarkers)
        for (const rec of filtered) {
            const key = rec.track.id || rec.track.url
            const existing = allRecommendations.get(key)
            if (existing) {
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
