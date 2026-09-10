import { TrackProcessor } from './trackProcessor'
import type {
    TrackInfo,
    TrackCacheKey,
    TrackCategories,
    TrackSearchOptions,
    TrackCacheOptions,
} from './types'
import type { Track } from 'discord-player'

/**
 * Main track utilities service
 */
export class TrackUtils {
    private readonly processor: TrackProcessor

    constructor() {
        this.processor = new TrackProcessor()
    }

    getTrackInfo(track: Track): TrackInfo {
        return this.processor.getTrackInfo(track)
    }

    getTrackCacheKey(track: Track): TrackCacheKey {
        return this.processor.getTrackCacheKey(track)
    }

    categorizeTracks(tracks: Track[]): TrackCategories {
        return this.processor.categorizeTracks(tracks)
    }

    findSimilarTracks(tracks: Track[], query: string, limit?: number): Track[] {
        return this.processor.findSimilarTracks(tracks, query, limit)
    }

    searchTracks(tracks: Track[], options: TrackSearchOptions): Track[] {
        return this.processor.searchTracks(tracks, options)
    }

    cacheTrackInfo(track: Track): void {
        this.processor.cacheTrackInfo(track)
    }

    getCachedTrackInfo(track: Track): TrackInfo | undefined {
        return this.processor.getCachedTrackInfo(track)
    }

    clearCache(): void {
        this.processor.clearCache()
    }

    getCacheSize(): number {
        return this.processor.getCacheSize()
    }

    startCacheCleanup(): void {
        this.processor.startCacheCleanup()
    }
}

export const trackUtils = new TrackUtils()

export const getTrackInfo = (track: Track): TrackInfo => {
    return trackUtils.getTrackInfo(track)
}

export const getTrackCacheKey = (track: Track): TrackCacheKey => {
    return trackUtils.getTrackCacheKey(track)
}

export const categorizeTracks = (tracks: Track[]): TrackCategories => {
    return trackUtils.categorizeTracks(tracks)
}

export const findSimilarTracks = (
    tracks: Track[],
    query: string,
    limit?: number,
): Track[] => {
    return trackUtils.findSimilarTracks(tracks, query, limit)
}

export const searchTracks = (
    tracks: Track[],
    options: TrackSearchOptions,
): Track[] => {
    return trackUtils.searchTracks(tracks, options)
}

export const cacheTrackInfo = (track: Track): void => {
    trackUtils.cacheTrackInfo(track)
}

export const getCachedTrackInfo = (track: Track): TrackInfo | undefined => {
    return trackUtils.getCachedTrackInfo(track)
}

export const clearCache = (): void => {
    trackUtils.clearCache()
}

export const getCacheSize = (): number => {
    return trackUtils.getCacheSize()
}

export const startCacheCleanup = (): void => {
    trackUtils.startCacheCleanup()
}

export type {
    TrackInfo,
    TrackCacheKey,
    TrackCategories,
    TrackSearchOptions,
    TrackCacheOptions,
}
