import type { GuildQueue, Track } from 'discord-player'
import { debugLog } from '../../general/log'

/**
 * Queue strategy implementation for LIFO/FIFO operations
 * Based on discord-player QueueStrategy type
 */
export type QueueStrategy = 'LIFO' | 'FIFO'

export class QueueStrategyManager {
    /**
     * Add track using specified strategy
     */
    static addTrackWithStrategy(
        queue: GuildQueue,
        track: Track,
        strategy: QueueStrategy = 'FIFO'
    ): void {
        try {
            if (strategy === 'LIFO') {
                // Last In, First Out - add to beginning
                queue.insertTrack(track, 0)
                debugLog({
                    message: 'Added track using LIFO strategy',
                    data: { trackTitle: track.title, position: 0 }
                })
            } else {
                // First In, First Out - add to end (default)
                queue.addTrack(track)
                debugLog({
                    message: 'Added track using FIFO strategy',
                    data: { trackTitle: track.title }
                })
            }
        } catch (error) {
            debugLog({ message: 'Error adding track with strategy:', error })
            throw error
        }
    }

    /**
     * Add multiple tracks using specified strategy
     */
    static addTracksWithStrategy(
        queue: GuildQueue,
        tracks: Track[],
        strategy: QueueStrategy = 'FIFO'
    ): void {
        try {
            if (strategy === 'LIFO') {
                // Add tracks in reverse order for LIFO
                for (let i = tracks.length - 1; i >= 0; i--) {
                    queue.insertTrack(tracks[i], 0)
                }
                debugLog({
                    message: 'Added tracks using LIFO strategy',
                    data: { trackCount: tracks.length }
                })
            } else {
                // Add tracks in order for FIFO
                for (const track of tracks) {
                    queue.addTrack(track)
                }
                debugLog({
                    message: 'Added tracks using FIFO strategy',
                    data: { trackCount: tracks.length }
                })
            }
        } catch (error) {
            debugLog({ message: 'Error adding tracks with strategy:', error })
            throw error
        }
    }

    /**
     * Get next track based on strategy
     */
    static getNextTrack(queue: GuildQueue, strategy: QueueStrategy = 'FIFO'): Track | null {
        try {
            if (queue.tracks.size === 0) {
                return null
            }

            if (strategy === 'LIFO') {
                // Get the last track (most recently added)
                return queue.tracks.at(-1) || null
            } else {
                // Get the first track (oldest)
                return queue.tracks.at(0) || null
            }
        } catch (error) {
            debugLog({ message: 'Error getting next track with strategy:', error })
            return null
        }
    }

    /**
     * Remove track based on strategy
     */
    static removeTrackWithStrategy(
        queue: GuildQueue,
        strategy: QueueStrategy = 'FIFO'
    ): Track | null {
        try {
            if (queue.tracks.size === 0) {
                return null
            }

            let removedTrack: Track | null = null

            if (strategy === 'LIFO') {
                // Remove the last track (most recently added)
                const lastIndex = queue.tracks.size - 1
                removedTrack = queue.tracks.at(lastIndex) || null
                if (removedTrack) {
                    queue.removeTrack(lastIndex)
                }
            } else {
                // Remove the first track (oldest)
                removedTrack = queue.tracks.at(0) || null
                if (removedTrack) {
                    queue.removeTrack(0)
                }
            }

            debugLog({
                message: 'Removed track using strategy',
                data: { strategy, trackTitle: removedTrack?.title }
            })

            return removedTrack
        } catch (error) {
            debugLog({ message: 'Error removing track with strategy:', error })
            return null
        }
    }
}
