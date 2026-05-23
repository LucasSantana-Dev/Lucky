import { type Track } from 'discord-player'
import { debugLog, errorLog } from '@lucky/shared/utils'
import { trackHistoryService } from '@lucky/shared/services'
import { MusicRecommendationService } from '../../../services/musicRecommendation'

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

        const recentHistory = await trackHistoryService.getTrackHistory(
            guildId,
            10,
        )

        // Convert history entries to Track objects
        // Note: recommendation engine only reads id, url, title, author, and duration from Track;
        // metadata is optional and safely defaults to undefined in the similarity calculation
        const historyTracks = recentHistory.map(
            (entry) =>
                ({
                    id: entry.trackId,
                    title: entry.title,
                    author: entry.author,
                    duration: entry.duration,
                    url: entry.url,
                }) as unknown as Track,
        )

        const availableTracks = await getAvailableTracks(guildId)

        if (availableTracks.length === 0) {
            return []
        }

        // Use recommendTracks with 'auto' strategy for flexibility
        const recommendations = await recommendationService.recommendTracks({
            guildId,
            seedTracks: currentTrack ? [currentTrack] : [],
            trackHistory: historyTracks,
            availableTracks,
            strategy: 'auto',
            limit,
        })

        const recommendedTracks = recommendations.map((rec) => rec.track)

        debugLog({
            message: 'Autoplay recommendations generated',
            data: { guildId, count: recommendedTracks.length },
        })

        return recommendedTracks
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
 * Get current recommendation configuration
 */
export function getRecommendationConfig() {
    return recommendationService.getConfig()
}
