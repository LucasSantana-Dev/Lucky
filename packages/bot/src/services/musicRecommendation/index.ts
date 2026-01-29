import type { Track } from 'discord-player'
import type {
  RecommendationResult,
  RecommendationConfig,
  UserPreferenceSeed,
  RecommendationContext,
} from './types'
import type { TrackHistoryEntry } from '@lukbot/shared/services'
import {
  generateRecommendations,
  generateUserPreferenceRecommendations,
  generateHistoryBasedRecommendations,
} from './recommendationEngine'
import { trackHistoryService } from '@lukbot/shared/services'
import { debugLog, errorLog } from '@lukbot/shared/utils'

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
      ...config,
    }
  }

  async getRecommendations(
    seedTrack: Track,
    availableTracks: Track[],
    excludeTrackIds: string[] = [],
  ): Promise<RecommendationResult[]> {
    try {
      debugLog({
        message: 'Generating recommendations for track',
        data: { trackId: seedTrack.id, availableTracks: availableTracks.length },
      })

      return generateRecommendations(seedTrack, availableTracks, this.config, excludeTrackIds)
    } catch (error) {
      errorLog({ message: 'Error getting recommendations:', error })
      return []
    }
  }

  async getUserPreferenceRecommendations(
    preferences: UserPreferenceSeed,
    availableTracks: Track[],
    excludeTrackIds: string[] = [],
  ): Promise<RecommendationResult[]> {
    try {
      debugLog({
        message: 'Generating user preference recommendations',
        data: { preferences, availableTracks: availableTracks.length },
      })

      return generateUserPreferenceRecommendations(
        preferences,
        availableTracks,
        this.config,
        excludeTrackIds,
      )
    } catch (error) {
      errorLog({ message: 'Error getting user preference recommendations:', error })
      return []
    }
  }

  async getRecommendationsBasedOnHistory(
    guildId: string,
    availableTracks: Track[],
    limit: number = 5,
  ): Promise<RecommendationResult[]> {
    try {
      const history = await trackHistoryService.getTrackHistory(guildId, 20)

      if (history.length === 0) {
        debugLog({ message: 'No history found for recommendations', data: { guildId } })
        return []
      }

      const recentTracks = history.map((h: TrackHistoryEntry) =>
        historyEntryToTrack(h),
      )
      const excludeIds = history.slice(0, 5).map((h) => h.trackId)

      debugLog({
        message: 'Generating history-based recommendations',
        data: { guildId, historyLength: history.length, availableTracks: availableTracks.length },
      })

      const results = await generateHistoryBasedRecommendations(
        recentTracks,
        availableTracks,
        this.config,
        excludeIds,
      )
      return results.slice(0, limit)
    } catch (error) {
      errorLog({ message: 'Error getting history-based recommendations:', error })
      return []
    }
  }

  async getContextualRecommendations(
    context: RecommendationContext,
  ): Promise<RecommendationResult[]> {
    try {
      const { currentTrack, recentHistory, availableTracks, config } = context

      if (currentTrack) {
        return generateRecommendations(currentTrack, availableTracks, config)
      }

      if (recentHistory.length > 0) {
        return generateHistoryBasedRecommendations(recentHistory, availableTracks, config)
      }

      return []
    } catch (error) {
      errorLog({ message: 'Error getting contextual recommendations:', error })
      return []
    }
  }

  updateConfig(newConfig: Partial<RecommendationConfig>): void {
    Object.assign(this.config, newConfig)
    debugLog({ message: 'Updated recommendation config', data: { config: this.config } })
  }

  getConfig(): RecommendationConfig {
    return { ...this.config }
  }

  async getPersonalizedRecommendations(
    guildId: string,
    availableTracks: Track[],
    limit: number = 5,
  ): Promise<RecommendationResult[]> {
    return this.getRecommendationsBasedOnHistory(guildId, availableTracks, limit)
  }
}

function historyEntryToTrack(h: TrackHistoryEntry): Track {
  return {
    id: h.trackId,
    title: h.title,
    author: h.author,
    duration: h.duration,
    url: h.url,
    requestedBy: h.playedBy ? { id: h.playedBy } : null,
    metadata: { isAutoplay: h.isAutoplay || false },
  } as unknown as Track
}

export type {
  RecommendationResult,
  RecommendationConfig,
  UserPreferenceSeed,
  RecommendationContext,
} from './types'

export const musicRecommendationService = new MusicRecommendationService()
