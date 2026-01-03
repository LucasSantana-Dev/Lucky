import { type Track } from 'discord-player'
import { debugLog, errorLog } from '../../general/log'
import {
    MusicRecommendationService,
    type RecommendationConfig,
} from '../../../services/MusicRecommendationService'
import { ServiceFactory } from '../../../services/ServiceFactory'

// Initialize recommendation service with default config
const recommendationService = new MusicRecommendationService({
    maxRecommendations: 8,
    similarityThreshold: 0.4,
    genreWeight: 0.4,
    tagWeight: 0.3,
    artistWeight: 0.2,
    durationWeight: 0.05,
    popularityWeight: 0.05,
    diversityFactor: 0.1,
})

/**
 * Get autoplay recommendations for a guild
 */
export async function getAutoplayRecommendations(
    guildId: string,
    currentTrack?: Track,
    limit: number = 5,
): Promise<Track[]> {
    try {
        debugLog({
            message: 'Getting autoplay recommendations',
            data: { guildId, hasCurrentTrack: !!currentTrack, limit },
        })

        // Get recent history for context
        const trackHistoryService = ServiceFactory.getTrackHistoryService()
        const recentHistory = await trackHistoryService.getTrackHistory(guildId, 10)
        const historyTracks = recentHistory.map(entry => entry.url)

        let recommendations: Track[] = []

        if (currentTrack) {
            // Get recommendations based on current track
            // const _seedTrack = currentTrack // Unused for now
            const availableTracks = await getAvailableTracks(guildId)

            if (availableTracks.length > 0) {
                const personalizedRecommendations = await recommendationService.getPersonalizedRecommendations(
                    guildId,
                    availableTracks,
                    limit
                )

                recommendations = personalizedRecommendations.map(rec => rec.track)
            }
        } else if (historyTracks.length > 0) {
            // Get recommendations based on history
            const availableTracks = await getAvailableTracks(guildId)

            if (availableTracks.length > 0) {
                const personalizedRecommendations = await recommendationService.getRecommendationsBasedOnHistory(
                    guildId,
                    availableTracks,
                    limit
                )

                recommendations = personalizedRecommendations.map(rec => rec.track)
            }
        }

        debugLog({
            message: 'Autoplay recommendations generated',
            data: { guildId, count: recommendations.length },
        })

        return recommendations
    } catch (error) {
        errorLog({ message: 'Error getting autoplay recommendations:', error })
        return []
    }
}

/**
 * Get available tracks for recommendations
 */
async function getAvailableTracks(_guildId: string): Promise<Track[]> {
    // This would typically fetch from a music database or API
    // For now, return empty array as placeholder
    return []
}

/**
 * Update recommendation configuration
 */
export function updateRecommendationConfig(config: Partial<RecommendationConfig>): void {
    Object.assign(recommendationService, config)
    debugLog({ message: 'Updated recommendation configuration', data: config })
}

/**
 * Get current recommendation configuration
 */
export function getRecommendationConfig(): RecommendationConfig {
    return {
        maxRecommendations: recommendationService['config'].maxRecommendations,
        similarityThreshold: recommendationService['config'].similarityThreshold,
        genreWeight: recommendationService['config'].genreWeight,
        tagWeight: recommendationService['config'].tagWeight,
        artistWeight: recommendationService['config'].artistWeight,
        durationWeight: recommendationService['config'].durationWeight,
        popularityWeight: recommendationService['config'].popularityWeight,
        diversityFactor: recommendationService['config'].diversityFactor,
    }
}
