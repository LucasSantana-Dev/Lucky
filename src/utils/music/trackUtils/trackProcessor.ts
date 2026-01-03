import type { Track } from 'discord-player'
// import { errorLog } from "../../general/log"
import { isSimilarTitle } from '../titleComparison'
import { safeSetInterval } from '../../timerManager'
import { TrackCacheManager } from './cacheManager'
import type {
    TrackInfo,
    TrackCacheKey,
    TrackCategories,
    TrackSearchOptions,
} from './types'

/**
 * Track processor for handling track operations
 */
export class TrackProcessor {
    private readonly cacheManager: TrackCacheManager

    constructor() {
        this.cacheManager = new TrackCacheManager()
    }

    getTrackInfo(track: Track): TrackInfo {
        return {
            title: track.title,
            duration: track.duration,
            requester: track.requestedBy?.username ?? 'Unknown',
            isAutoplay: (track.metadata as { isAutoplay?: boolean })?.isAutoplay ?? false,
        }
    }

    getTrackCacheKey(track: Track): TrackCacheKey {
        return {
            id: track.id,
            title: track.title,
            duration: track.duration,
            requesterId: track.requestedBy?.id,
        }
    }

    categorizeTracks(tracks: Track[]): TrackCategories {
        const manualTracks: Track[] = []
        const autoplayTracks: Track[] = []

        for (const track of tracks) {
            if ((track.metadata as { isAutoplay?: boolean })?.isAutoplay) {
                autoplayTracks.push(track)
            } else {
                manualTracks.push(track)
            }
        }

        return { manualTracks, autoplayTracks }
    }

    findSimilarTracks(tracks: Track[], query: string, limit = 5): Track[] {
        const similarTracks: Track[] = []

        for (const track of tracks) {
            if (isSimilarTitle(track.title, query)) {
                similarTracks.push(track)
                if (similarTracks.length >= limit) {
                    break
                }
            }
        }

        return similarTracks
    }

    searchTracks(tracks: Track[], options: TrackSearchOptions): Track[] {
        const { query, limit, includeAutoplay } = options
        const results: Track[] = []

        for (const track of tracks) {
            if (!includeAutoplay && (track.metadata as { isAutoplay?: boolean })?.isAutoplay) {
                continue
            }

            if (
                track.title.toLowerCase().includes(query.toLowerCase()) ||
                track.author.toLowerCase().includes(query.toLowerCase())
            ) {
                results.push(track)
                if (results.length >= limit) {
                    break
                }
            }
        }

        return results
    }

    cacheTrackInfo(track: Track): void {
        const cacheKey = this.getTrackCacheKey(track)
        const trackInfo = this.getTrackInfo(track)
        this.cacheManager.set(cacheKey, trackInfo)
    }

    getCachedTrackInfo(track: Track): TrackInfo | undefined {
        const cacheKey = this.getTrackCacheKey(track)
        return this.cacheManager.get(cacheKey)
    }

    clearCache(): void {
        this.cacheManager.clear()
    }

    getCacheSize(): number {
        return this.cacheManager.size()
    }

    startCacheCleanup(): void {
        // Clean up cache every 5 minutes
        safeSetInterval(() => {
            this.clearCache()
        }, 300000)
    }
}
