import type { Track, GuildQueue } from 'discord-player'
import { debugLog, errorLog } from '../../general/log'
import { ServiceFactory } from '../../../services/ServiceFactory'
import type { TrackFilterOptions } from './types'

/**
 * Track filtering utilities
 */
export class TrackFilter {
    constructor(private options: TrackFilterOptions = {}) {}

    /**
     * Filter tracks based on options
     */
    filterTracks(tracks: Track[]): Track[] {
        return tracks.filter((track) => {
            // Basic filtering logic
            if (
                this.options.maxDuration &&
                typeof track.duration === 'number' &&
                track.duration > this.options.maxDuration
            ) {
                return false
            }
            if (
                this.options.minDuration &&
                typeof track.duration === 'number' &&
                track.duration < this.options.minDuration
            ) {
                return false
            }
            return true
        })
    }

    /**
     * Filter tracks to remove duplicates
     */
    static async filterDuplicateTracks(
        tracks: Track[],
        guildId: string,
        _currentTrackIds: Set<string>,
    ): Promise<Track[]> {
        try {
            debugLog({
                message: `Filtering ${tracks.length} tracks for duplicates`,
            })

            // Filter out duplicates using async function
            const trackHistoryService = ServiceFactory.getTrackHistoryService()
            const filteredTracks: Track[] = []
            for (const track of tracks) {
                const isDuplicate = await trackHistoryService.isDuplicateTrack(
                    guildId,
                    track.url,
                )
                if (!isDuplicate) {
                    filteredTracks.push(track)
                }
            }

            debugLog({
                message: `Filtered to ${filteredTracks.length} unique tracks`,
            })
            return filteredTracks
        } catch (error) {
            errorLog({ message: 'Error filtering duplicate tracks:', error })
            throw error
        }
    }

    /**
     * Get current track IDs in the queue for duplicate checking
     */
    static getCurrentTrackIds(queue: GuildQueue): Set<string> {
        return new Set(queue.tracks.map((track: Track) => track.url))
    }

    /**
     * Filter tracks by quality or other criteria
     */
    static filterByQuality(tracks: Track[], minDuration?: number): Track[] {
        if (!minDuration) return tracks

        return tracks.filter((track) => {
            const duration = this.parseDuration(track.duration)
            return duration >= minDuration
        })
    }

    /**
     * Parse duration string to seconds
     */
    private static parseDuration(duration: string): number {
        if (!duration || duration === '0:00') return 0

        const parts = duration.split(':')
        if (parts.length === 2) {
            const minutes = parseInt(parts[0], 10)
            const seconds = parseInt(parts[1], 10)
            return minutes * 60 + seconds
        }

        return 0
    }

    /**
     * Sort tracks by relevance or quality
     */
    static sortTracks(
        tracks: Track[],
        criteria: 'relevance' | 'duration' | 'views' = 'relevance',
    ): Track[] {
        switch (criteria) {
            case 'relevance':
                return tracks // Default sorting by relevance (no specific sorting needed)
            case 'duration':
                return tracks.sort((a, b) => {
                    const durationA = this.parseDuration(a.duration)
                    const durationB = this.parseDuration(b.duration)
                    return durationB - durationA
                })
            case 'views':
                return tracks.sort((a, b) => {
                    const viewsA = parseInt(String(a.views || '0'), 10)
                    const viewsB = parseInt(String(b.views || '0'), 10)
                    return viewsB - viewsA
                })
            default:
                return tracks
        }
    }
}
