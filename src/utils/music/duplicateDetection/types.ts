import type { Track } from 'discord-player'
import type { TrackHistoryEntry } from '../../../services/TrackHistoryService'
import type { TrackMetadata } from '../../../types/music'

// Legacy in-memory maps for backward compatibility (fallback when Redis is unavailable)
export const recentlyPlayedTracks = new Map<string, TrackHistoryEntry[]>()
export const trackIdSet = new Map<string, Set<string>>()
export const lastPlayedTracks = new Map<string, Track>()
export const artistGenreMap = new Map<string, TrackMetadata>()

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
