import type { Track } from 'discord-player'
import { LRUCache } from 'lru-cache'
import type { TrackHistoryEntry } from '@lucky/shared/services'
import type { TrackMetadata } from '@lucky/shared/types'

// Legacy in-memory maps for backward compatibility (fallback when Redis is unavailable)
// Using LRU caches with TTL to prevent unbounded memory growth on long-running bot
export const recentlyPlayedTracks = new LRUCache<string, TrackHistoryEntry[]>(
    {
        max: 5000,
        ttl: 30 * 60 * 1000, // 30 minutes
    },
)
export const trackIdSet = new LRUCache<string, Set<string>>({
    max: 5000,
    ttl: 30 * 60 * 1000, // 30 minutes
})
export const lastPlayedTracks = new LRUCache<string, Track>({
    max: 5000,
    ttl: 30 * 60 * 1000, // 30 minutes
})
export const artistGenreMap = new LRUCache<string, TrackMetadata>({
    max: 2000,
    ttl: 24 * 60 * 60 * 1000, // 24 hours
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
