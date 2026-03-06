import type { Track } from 'discord-player'
import type { RecommendationResult, RecommendationConfig, UserPreferenceSeed } from './types'
import { calculateTrackSimilarity } from './similarityCalculator'
import { createTrackVector, calculateVectorSimilarity } from './vectorOperations'
import { errorLog } from '@lukbot/shared/utils'
import { createUserPreferenceSeed, applyDiversityFilter, generateRecommendationReasons } from './recommendationHelpers'

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
      const similarity = calculateTrackSimilarity(seedTrack, track, config)
      if (similarity >= config.similarityThreshold) {
        const trackVector = createTrackVector(track)
        const vectorSimilarity = calculateVectorSimilarity(seedVector, trackVector, config)
        const finalScore = (similarity + vectorSimilarity) / 2
        recommendations.push({
          track, score: finalScore,
          reasons: generateRecommendationReasons(seedTrack, track, similarity, vectorSimilarity),
        })
      }
    }

    recommendations.sort((a, b) => b.score - a.score)
    return applyDiversityFilter(recommendations, config).slice(0, config.maxRecommendations)
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
    return generateRecommendations(virtualSeed, availableTracks, config, excludeTrackIds)
  } catch (error) {
    errorLog({ message: 'Error generating user preference recommendations:', error })
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
    const primarySeed = recentHistory[0]
    const primaryRecommendations = await generateRecommendations(primarySeed, availableTracks, config, excludeTrackIds)

    if (recentHistory.length > 1) {
      return blendRecommendations(primaryRecommendations, recentHistory.slice(1, 5), availableTracks, config, excludeTrackIds)
    }
    return primaryRecommendations
  } catch (error) {
    errorLog({ message: 'Error generating history-based recommendations:', error })
    return []
  }
}

async function blendRecommendations(
  primaryRecommendations: RecommendationResult[],
  additionalSeeds: Track[],
  availableTracks: Track[],
  config: RecommendationConfig,
  excludeTrackIds: string[],
): Promise<RecommendationResult[]> {
  const allRecommendations = new Map<string, RecommendationResult>()
  for (const rec of primaryRecommendations) {
    allRecommendations.set(rec.track.id || rec.track.url, rec)
  }
  for (const seed of additionalSeeds) {
    const seedRecs = await generateRecommendations(seed, availableTracks, config, excludeTrackIds)
    for (const rec of seedRecs) {
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
