/**
 * Track search types and interfaces
 */

import type { Track, SearchQueryType } from 'discord-player'
import type { User } from 'discord.js'

export type TrackSearchOptions = {
    query: string
    type: SearchQueryType
    user: User
    limit?: number
    includeAutoplay?: boolean
}

export type TrackSearchResult = {
    success: boolean
    tracks: Track[]
    error?: string
    totalResults?: number
}

export type TrackFilterOptions = {
    maxDuration?: number
    minDuration?: number
    maxFileSize?: number
    includeLive?: boolean
    includePlaylists?: boolean
}

export type TrackSearchConfig = {
    defaultLimit: number
    maxResults: number
    timeout: number
    retryAttempts: number
}

export type QueryTypeDetection = {
    type: 'youtube' | 'spotify' | 'search'
    confidence: number
    patterns: string[]
}
