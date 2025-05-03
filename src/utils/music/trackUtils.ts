import { Track } from 'discord-player';
import { errorLog } from '../general/log';
import { isSimilarTitle } from './titleComparison';
import { safeSetInterval } from '../timerManager';

// Type definitions
interface TrackInfo {
    title: string;
    duration: string;
    requester: string;
    isAutoplay: boolean;
}

interface TrackCacheKey {
    id: string;
    title: string;
    duration: string | number;
    requesterId?: string;
}

interface TrackCategories {
    manualTracks: Track[];
    autoplayTracks: Track[];
}

type CacheKey = string;
type CacheValue = TrackInfo;

// LRU cache for track info
class LRUCache<K, V> {
    private maxSize: number;
    private cache: Map<K, V>;
    constructor(maxSize: number) {
        this.maxSize = maxSize;
        this.cache = new Map();
    }
    get(key: K): V | undefined {
        if (!this.cache.has(key)) return undefined;
        const value = this.cache.get(key)!;
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }
    set(key: K, value: V): void {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }
    clear(): void {
        this.cache.clear();
    }
}

const TRACK_INFO_CACHE_SIZE = 2000;
const trackInfoCache = new LRUCache<CacheKey, CacheValue>(TRACK_INFO_CACHE_SIZE);

/**
 * Type guard to check if a value is a valid track
 */
function isValidTrack(track: unknown): track is Track {
    return track !== null &&
        typeof track === 'object' &&
        'title' in track &&
        'duration' in track;
}

/**
 * Type guard to check if a value is a valid duration
 */
function isValidDuration(duration: unknown): duration is string | number {
    return typeof duration === 'string' || typeof duration === 'number';
}

/**
 * Generates a cache key for a track
 */
function generateCacheKey(track: Track): string {
    const key: TrackCacheKey = {
        id: track.id || '',
        title: track.title || '',
        duration: track.duration || '',
        requesterId: track.requestedBy?.id
    };
    return JSON.stringify(key);
}

/**
 * Gets information about a track with caching
 */
export function getTrackInfo(track: Track | null | undefined): TrackInfo {
    if (!isValidTrack(track)) {
        return {
            title: 'Unknown Track',
            duration: '00:00',
            requester: 'Unknown',
            isAutoplay: false
        };
    }

    // Generate cache key from track properties
    const cacheKey = generateCacheKey(track);
    if (trackInfoCache.get(cacheKey)) {
        return trackInfoCache.get(cacheKey)!;
    }

    try {
        const title = track.title || 'Unknown Title';
        const duration = formatDuration(track.duration);
        const requester = track.requestedBy?.username || 'Unknown';
        const isAutoplay = Boolean(track.requestedBy?.bot);

        const info: TrackInfo = { title, duration, requester, isAutoplay };
        trackInfoCache.set(cacheKey, info);
        return info;
    } catch (error) {
        errorLog({ message: 'Error getting track info:', error });
        return {
            title: 'Error Processing Track',
            duration: '00:00',
            requester: 'Unknown',
            isAutoplay: false
        };
    }
}

/**
 * Formats a duration in seconds to MM:SS or HH:MM:SS format
 */
export function formatDuration(duration: string | number): string {
    if (!isValidDuration(duration)) {
        return '00:00';
    }

    try {
        let totalSeconds: number;

        if (typeof duration === 'string') {
            // Handle duration in format "HH:MM:SS" or "MM:SS"
            const parts = duration.split(':').map(Number);
            if (parts.length === 3) {
                // HH:MM:SS format
                totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
            } else if (parts.length === 2) {
                // MM:SS format
                totalSeconds = parts[0] * 60 + parts[1];
            } else {
                // Try parsing as seconds
                totalSeconds = parseInt(duration);
                if (isNaN(totalSeconds)) {
                    return '00:00';
                }
            }
        } else {
            totalSeconds = duration;
        }

        if (isNaN(totalSeconds) || totalSeconds < 0) {
            return '00:00';
        }

        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
    } catch (error) {
        errorLog({ message: 'Error formatting duration:', error });
        return '00:00';
    }
}

/**
 * Checks if a track is a duplicate of any existing tracks
 */
export function isDuplicateTrack(newTrack: Track, existingTracks: Track[]): boolean {
    if (!isValidTrack(newTrack) || !Array.isArray(existingTracks) || existingTracks.length === 0) {
        return false;
    }

    try {
        return existingTracks.some(existingTrack =>
            isValidTrack(existingTrack) &&
            isSimilarTitle(newTrack.title || '', existingTrack.title || '')
        );
    } catch (error) {
        errorLog({ message: 'Error checking for duplicate track:', error });
        return false;
    }
}

/**
 * Separates tracks into manual and autoplay categories
 */
export function separateTracks(tracks: Track[]): TrackCategories {
    if (!Array.isArray(tracks) || tracks.length === 0) {
        return { manualTracks: [], autoplayTracks: [] };
    }

    try {
        return tracks.reduce((acc: TrackCategories, track) => {
            if (isValidTrack(track) && track.requestedBy?.bot) {
                acc.autoplayTracks.push(track);
            } else if (isValidTrack(track)) {
                acc.manualTracks.push(track);
            }
            return acc;
        }, { manualTracks: [], autoplayTracks: [] });
    } catch (error) {
        errorLog({ message: 'Error separating tracks:', error });
        return { manualTracks: [], autoplayTracks: [] };
    }
}

// Clear caches periodically to prevent memory leaks
safeSetInterval(() => {
    trackInfoCache.clear();
}, 1000 * 60 * 60); // Clear every hour 