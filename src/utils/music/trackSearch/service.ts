import type { Track, GuildQueue, SearchQueryType } from 'discord-player'
import type { User } from 'discord.js'
import { debugLog } from '../../general/log'
import { enhancedSearch } from '../enhancedSearch'
import {
    logYouTubeError,
    isRecoverableYouTubeError,
} from '../youtubeErrorHandler'
import { QueryDetector } from './queryDetector'
import { TrackFilter } from './trackFilter'
import type {
    TrackSearchOptions,
    TrackSearchResult,
    TrackFilterOptions,
} from './types'

/**
 * Track search service
 */
export class TrackSearchService {
    /**
     * Search for tracks using discord-player's search engine
     */
    static async searchTracks(
        player: GuildQueue['player'],
        query: string,
        _type: SearchQueryType,
        user: User,
    ): Promise<Track[]> {
        try {
            const result = await player.search(query, {
                requestedBy: user,
            })

            if (result.hasTracks()) {
                return result.tracks
            }

            return []
        } catch (error) {
            logYouTubeError(error as Error, query, user.id)
            throw error
        }
    }

    /**
     * Enhanced search with fallback options
     */
    static async enhancedSearchTracks(
        player: GuildQueue['player'],
        query: string,
        user: User,
        _options: TrackSearchOptions = {} as TrackSearchOptions,
    ): Promise<TrackSearchResult> {
        try {
            debugLog({ message: `Enhanced search for: ${query}` })

            const result = await enhancedSearch(player, query, user, undefined)

            if (result.success && result.result && result.result.hasTracks()) {
                return {
                    success: true,
                    tracks: result.result.tracks,
                    totalResults: result.result.tracks.length,
                }
            }

            return {
                success: false,
                tracks: [],
                error: result.error || 'No tracks found',
            }
        } catch (error) {
            logYouTubeError(error as Error, query, user.id)

            if (isRecoverableYouTubeError(error as Error)) {
                return {
                    success: false,
                    tracks: [],
                    error: 'Temporary search error, please try again',
                }
            }

            return {
                success: false,
                tracks: [],
                error: 'Search failed',
            }
        }
    }

    /**
     * Filter tracks based on criteria
     */
    static filterTracks(
        tracks: Track[],
        options: TrackFilterOptions = {},
    ): Track[] {
        const filter = new TrackFilter(options)
        return filter.filterTracks(tracks)
    }

    /**
     * Detect query type and search accordingly
     */
    static async detectAndSearch(
        player: GuildQueue['player'],
        query: string,
        user: User,
        options: TrackSearchOptions = {} as TrackSearchOptions,
    ): Promise<TrackSearchResult> {
        try {
            const queryType = QueryDetector.detectQueryType(query)
            const searchOptions = { ...options, type: queryType.type as SearchQueryType }

            return await this.enhancedSearchTracks(
                player,
                query,
                user,
                searchOptions,
            )
        } catch (error) {
            logYouTubeError(error as Error, query, user.id)
            return {
                success: false,
                tracks: [],
                error: 'Search failed',
            }
        }
    }
}
