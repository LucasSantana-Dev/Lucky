import type { Player, QueryType } from 'discord-player'
import type { User } from 'discord.js'
import { SearchEngineManager } from './engineManager'
import type { EnhancedSearchOptions, EnhancedSearchResult } from './types'

/**
 * Enhanced search service with fallback mechanisms
 */
export class EnhancedSearchService {
    private readonly engineManager: SearchEngineManager

    constructor(player: Player) {
        this.engineManager = new SearchEngineManager(player)
    }

    async search(
        options: EnhancedSearchOptions,
    ): Promise<EnhancedSearchResult> {
        return this.engineManager.performSearch(options)
    }

    async searchWithRetry(
        options: EnhancedSearchOptions,
    ): Promise<EnhancedSearchResult> {
        return this.engineManager.performRetrySearch(options)
    }
}

export async function enhancedSearch(
    player: Player,
    query: string,
    requestedBy: User,
    preferredEngine?: string,
): Promise<EnhancedSearchResult> {
    const service = new EnhancedSearchService(player)
    return service.search({
        query,
        requestedBy,
        preferredEngine: preferredEngine as EnhancedSearchOptions['preferredEngine'],
    })
}

export async function enhancedAutoSearch(
    player: Player,
    query: string,
    requestedBy: User,
): Promise<EnhancedSearchResult> {
    const service = new EnhancedSearchService(player)
    return service.search({
        query,
        requestedBy,
        preferredEngine: undefined, // Auto-detect
    })
}

export async function enhancedYouTubeSearch(
    player: Player,
    query: string,
    requestedBy: User,
    isPlaylist?: boolean,
): Promise<EnhancedSearchResult> {
    const service = new EnhancedSearchService(player)
    return service.search({
        query,
        requestedBy,
        preferredEngine: isPlaylist ? 'youtubePlaylist' : 'youtube',
    })
}

export async function enhancedSpotifySearch(
    player: Player,
    query: string,
    requestedBy: User,
): Promise<EnhancedSearchResult> {
    const service = new EnhancedSearchService(player)
    return service.search({
        query,
        requestedBy,
        preferredEngine: 'spotify' as QueryType,
    })
}

export type { EnhancedSearchOptions, EnhancedSearchResult } from './types'
