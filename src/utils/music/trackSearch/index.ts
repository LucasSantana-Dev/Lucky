import { TrackSearchService } from './service'
import type {
    TrackSearchOptions,
    TrackSearchResult,
    TrackFilterOptions,
    TrackSearchConfig,
} from './types'
import type { Player, SearchQueryType, Track } from 'discord-player'
import type { User } from 'discord.js'

/**
 * Main track search service
 */
export class TrackSearch {
    constructor() {
        // Service is used statically
    }

    async searchTracks(
        player: Player,
        query: string,
        type: string,
        user: User,
    ): Promise<unknown[]> {
        return TrackSearchService.searchTracks(player, query, type as SearchQueryType, user)
    }

    async enhancedSearchTracks(
        player: Player,
        query: string,
        user: User,
        options?: TrackSearchOptions,
    ): Promise<TrackSearchResult> {
        return TrackSearchService.enhancedSearchTracks(
            player,
            query,
            user,
            options,
        )
    }

    filterTracks(tracks: unknown[], options?: TrackFilterOptions): unknown[] {
        return TrackSearchService.filterTracks(tracks as Track[], options)
    }

    async detectAndSearch(
        player: Player,
        query: string,
        user: User,
        options?: TrackSearchOptions,
    ): Promise<TrackSearchResult> {
        return TrackSearchService.detectAndSearch(player, query, user, options)
    }
}

export const trackSearch = new TrackSearch()

export const searchTracks = async (
    player: Player,
    query: string,
    type: string,
    user: User,
): Promise<unknown[]> => {
    return trackSearch.searchTracks(player, query, type, user)
}

export const enhancedSearchTracks = async (
    player: Player,
    query: string,
    user: User,
    options?: TrackSearchOptions,
): Promise<TrackSearchResult> => {
    return trackSearch.enhancedSearchTracks(player, query, user, options)
}

export const filterTracks = (
    tracks: unknown[],
    options?: TrackFilterOptions,
): unknown[] => {
    return trackSearch.filterTracks(tracks, options)
}

export const detectAndSearch = async (
    player: Player,
    query: string,
    user: User,
    options?: TrackSearchOptions,
): Promise<TrackSearchResult> => {
    return trackSearch.detectAndSearch(player, query, user, options)
}

export type {
    TrackSearchOptions,
    TrackSearchResult,
    TrackFilterOptions,
    TrackSearchConfig,
}
