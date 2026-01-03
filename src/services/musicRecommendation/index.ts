import type { Track } from 'discord-player'
import type {
    RecommendationResult,
    RecommendationConfig,
    UserPreferenceSeed,
    RecommendationContext
} from './types'
import type { TrackHistoryEntry } from '../TrackHistoryService'
import { generateRecommendations, generateUserPreferenceRecommendations, generateHistoryBasedRecommendations } from './recommendationEngine'
import { ServiceFactory } from '../ServiceFactory'
import { debugLog, errorLog } from '../../utils/general/log'

/**
 * Main Music Recommendation Service
 * Orchestrates recommendation generation using modular components
 */
export class MusicRecommendationService {
    private readonly config: RecommendationConfig

    constructor(config: Partial<RecommendationConfig> = {}) {
        this.config = {
            maxRecommendations: 10,
            similarityThreshold: 0.3,
            genreWeight: 0.4,
            tagWeight: 0.3,
            artistWeight: 0.2,
            durationWeight: 0.05,
            popularityWeight: 0.05,
            diversityFactor: 0.3,
            ...config
        }
    }

    /**
     * Get recommendations based on a specific track
     */
    async getRecommendations(
        seedTrack: Track,
        availableTracks: Track[],
        excludeTrackIds: string[] = []
    ): Promise<RecommendationResult[]> {
        try {
            debugLog({
                message: 'Generating recommendations for track',
                data: { trackId: seedTrack.id, availableTracks: availableTracks.length }
            })

            return generateRecommendations(seedTrack, availableTracks, this.config, excludeTrackIds)
        } catch (error) {
            errorLog({ message: 'Error getting recommendations:', error })
            return []
        }
    }

    /**
     * Get recommendations based on user preferences
     */
    async getUserPreferenceRecommendations(
        preferences: UserPreferenceSeed,
        availableTracks: Track[],
        excludeTrackIds: string[] = []
    ): Promise<RecommendationResult[]> {
        try {
            debugLog({
                message: 'Generating user preference recommendations',
                data: { preferences, availableTracks: availableTracks.length }
            })

            return generateUserPreferenceRecommendations(preferences, availableTracks, this.config, excludeTrackIds)
        } catch (error) {
            errorLog({ message: 'Error getting user preference recommendations:', error })
            return []
        }
    }

    /**
     * Get recommendations based on listening history
     */
    async getRecommendationsBasedOnHistory(
        guildId: string,
        availableTracks: Track[],
        limit: number = 5
    ): Promise<RecommendationResult[]> {
        try {
            // Get recent listening history
            const trackHistoryService = ServiceFactory.getTrackHistoryService()
            const history = await trackHistoryService.getTrackHistory(guildId, 20)

            if (history.length === 0) {
                debugLog({ message: 'No history found for recommendations', data: { guildId } })
                return []
            }

            // Convert history to tracks and get track IDs to exclude
            const recentTracks = history.map((h: TrackHistoryEntry) => ({
                id: h.trackId,
                title: h.title,
                author: h.author,
                duration: h.duration,
                url: h.url,
                requestedBy: h.playedBy ? { id: h.playedBy } : null,
                metadata: { isAutoplay: h.isAutoplay || false }
            } as Track))
            const excludeIds = history.slice(0, 5).map(h => h.trackId) // Exclude last 5 played tracks

            debugLog({
                message: 'Generating history-based recommendations',
                data: { guildId, historyLength: history.length, availableTracks: availableTracks.length }
            })

            return generateHistoryBasedRecommendations(
                recentTracks,
                availableTracks,
                this.config,
                excludeIds
            ).then(results => results.slice(0, limit))
        } catch (error) {
            errorLog({ message: 'Error getting history-based recommendations:', error })
            return []
        }
    }

    /**
     * Get recommendations with full context
     */
    async getContextualRecommendations(
        context: RecommendationContext
    ): Promise<RecommendationResult[]> {
        try {
            const { currentTrack, recentHistory, availableTracks, config } = context

            // Use current track as primary seed if available
            if (currentTrack) {
                return generateRecommendations(currentTrack, availableTracks, config)
            }

            // Fall back to history-based recommendations
            if (recentHistory.length > 0) {
                return generateHistoryBasedRecommendations(recentHistory, availableTracks, config)
            }

            return []
        } catch (error) {
            errorLog({ message: 'Error getting contextual recommendations:', error })
            return []
        }
    }

    /**
     * Update service configuration
     */
    updateConfig(newConfig: Partial<RecommendationConfig>): void {
        Object.assign(this.config, newConfig)
        debugLog({ message: 'Updated recommendation config', data: { config: this.config } })
    }

    /**
     * Get current configuration
     */
    getConfig(): RecommendationConfig {
        return { ...this.config }
    }

    /**
     * Get personalized recommendations (alias for getRecommendationsBasedOnHistory)
     */
    async getPersonalizedRecommendations(
        guildId: string,
        availableTracks: Track[],
        limit: number = 5
    ): Promise<RecommendationResult[]> {
        return this.getRecommendationsBasedOnHistory(guildId, availableTracks, limit)
    }
}

export type {
    RecommendationResult,
    RecommendationConfig,
    UserPreferenceSeed,
    RecommendationContext
} from './types'

// Create default instance
export const musicRecommendationService = new MusicRecommendationService()
