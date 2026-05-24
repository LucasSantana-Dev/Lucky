import type { Track } from 'discord-player'
import type {
    RecommendationResult,
    RecommendationConfig,
    RecommendationInput,
} from './types'
import {
    generateRecommendations,
    generateUserPreferenceRecommendations,
    generateHistoryBasedRecommendations,
} from './recommendationEngine'
import { debugLog, errorLog } from '@lucky/shared/utils'

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
            maxTracksPerArtist: 2,
            maxTracksPerSource: 3,
            ...config,
        }
    }

    async recommendTracks(
        input: RecommendationInput,
    ): Promise<RecommendationResult[]> {
        try {
            const {
                guildId,
                seedTracks,
                trackHistory,
                availableTracks,
                userPreferences,
                strategy,
                limit,
            } = input

            // Exclude recently played tracks to avoid repetition
            const excludeIds = trackHistory.slice(0, 5).map((t) => t.id)

            if (strategy === 'preference') {
                if (!userPreferences) {
                    debugLog({
                        message:
                            'Preference strategy requested but no userPreferences provided',
                        data: { guildId },
                    })
                    return []
                }

                debugLog({
                    message: 'Generating preference-based recommendations',
                    data: {
                        guildId,
                        availableTracks: availableTracks.length,
                    },
                })

                const results = await generateUserPreferenceRecommendations(
                    userPreferences,
                    availableTracks,
                    this.config,
                    excludeIds,
                )
                return results.slice(0, limit)
            }

            if (strategy === 'history') {
                debugLog({
                    message: 'Generating history-based recommendations',
                    data: {
                        guildId,
                        historyLength: trackHistory.length,
                        availableTracks: availableTracks.length,
                    },
                })

                const results = await generateHistoryBasedRecommendations(
                    trackHistory,
                    availableTracks,
                    this.config,
                    excludeIds,
                )
                return results.slice(0, limit)
            }

            // For 'auto' strategy, use fallback logic
            if (seedTracks.length > 0) {
                debugLog({
                    message: 'Auto strategy: using seed track',
                    data: { guildId },
                })

                const results = await generateRecommendations(
                    seedTracks[0],
                    availableTracks,
                    this.config,
                    excludeIds,
                )
                return results.slice(0, limit)
            }

            if (trackHistory.length > 0) {
                debugLog({
                    message: 'Auto strategy: falling back to history',
                    data: { guildId },
                })

                const results = await generateHistoryBasedRecommendations(
                    trackHistory,
                    availableTracks,
                    this.config,
                    excludeIds,
                )
                return results.slice(0, limit)
            }

            debugLog({
                message:
                    'No seed tracks or history available for recommendations',
                data: { guildId },
            })
            return []
        } catch (error) {
            errorLog({ message: 'Error generating recommendations:', error })
            return []
        }
    }

    getConfig(): RecommendationConfig {
        return { ...this.config }
    }
}

export type {
    RecommendationResult,
    RecommendationConfig,
    RecommendationInput,
} from './types'

export const musicRecommendationService = new MusicRecommendationService()
