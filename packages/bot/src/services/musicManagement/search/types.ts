/**
 * Enhanced search types and interfaces
 */

import type { User } from 'discord.js'
import type { SearchResult, QueryType } from 'discord-player'

export type EnhancedSearchOptions = {
    query: string
    requestedBy: User
    preferredEngine?: QueryType
    maxRetries?: number
    enableFallbacks?: boolean
}

export type EnhancedSearchResult = {
    success: boolean
    result?: SearchResult
    error?: string
    usedFallback?: boolean
    attempts?: number
}

export type SearchEngineConfig = {
    maxRetries: number
    enableFallbacks: boolean
    preferredEngine: QueryType
}
