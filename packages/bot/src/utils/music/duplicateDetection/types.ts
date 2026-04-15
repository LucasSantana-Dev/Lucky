import type { Track } from 'discord-player'
import { LRUCache } from 'lru-cache'
import type { TrackHistoryEntry } from '@lucky/shared/services'
import type { TrackMetadata } from '@lucky/shared/types'

// Legacy in-memory maps for backward compatibility (fallback when Redis is unavailable)
// Using LRU caches with guild-scoped TTL to prevent unbounded growth
export const recentlyPlayedTracks = new LRUCache<string, TrackHistoryEntry[]>(
    {
        max: 1000,
        ttl: 60 * 60 * 1000,
    },
)
export const trackIdSet = new LRUCache<string, Set<string>>({
    max: 1000,
    ttl: 60 * 60 * 1000,
})
export const lastPlayedTracks = new LRUCache<string, Track>({
    max: 1000,
    ttl: 60 * 60 * 1000,
})
export const artistGenreMap = new LRUCache<string, TrackMetadata>({
    max: 1000,
    ttl: 60 * 60 * 1000,
})

export type { TrackHistoryEntry, TrackMetadata }

export type DuplicateCheckResult = {
    isDuplicate: boolean
    reason?: string
    similarTracks?: TrackHistoryEntry[]
    confidence?: number
}

export type SimilarityConfig = {
    titleThreshold: number
    artistThreshold: number
    durationThreshold: number
    timeWindow: number
}

export const defaultSimilarityConfig: SimilarityConfig = {
    titleThreshold: 0.8,
    artistThreshold: 0.7,
    durationThreshold: 0.9,
    timeWindow: 300000, // 5 minutes
}
