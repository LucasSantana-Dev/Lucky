import type { Track, GuildQueue } from 'discord-player'
import type { QueueState } from './types'
import { debugLog } from '../../general/log'

/**
 * Get current queue state
 */
export function getQueueState(queue: GuildQueue): QueueState {
    try {
        const currentTrack = queue.currentTrack
        const isPlaying = queue.node.isPlaying()
        const isPaused = queue.node.isPaused()
        const queueSize = queue.tracks.size
        const repeatMode = queue.repeatMode.toString()
        const volume = queue.node.volume
        const position = queue.node.getTimestamp()?.current?.valueOf() || 0
        const duration = typeof currentTrack?.duration === 'number' ? currentTrack.duration : parseInt(currentTrack?.duration?.toString() || '0')

        return {
            isPlaying,
            isPaused,
            currentTrack: currentTrack || undefined,
            queueSize,
            repeatMode: repeatMode.toString(),
            volume,
            position: typeof position === 'number' ? position : 0,
            duration
        }
    } catch (error) {
        debugLog({ message: 'Error getting queue state:', error })
        return {
            isPlaying: false,
            isPaused: false,
            queueSize: 0,
            repeatMode: 'OFF',
            volume: 100,
            position: 0,
            duration: 0
        }
    }
}

/**
 * Check if queue is empty
 */
export function isQueueEmpty(queue: GuildQueue): boolean {
    return queue.tracks.size === 0
}

/**
 * Check if queue is full
 */
export function isQueueFull(queue: GuildQueue, maxSize: number = 100): boolean {
    return queue.tracks.size >= maxSize
}

/**
 * Get queue statistics
 */
export function getQueueStats(queue: GuildQueue): {
    totalTracks: number
    totalDuration: number
    averageDuration: number
    genres: string[]
    artists: string[]
} {
    try {
        const tracks = queue.tracks.toArray()
        const totalTracks = tracks.length
        const totalDuration = tracks.reduce((sum, track) => {
            const duration = typeof track.duration === 'number' ? track.duration : parseInt(track.duration.toString())
            return sum + duration
        }, 0)
        const averageDuration = totalTracks > 0 ? totalDuration / totalTracks : 0

        const genres = new Set<string>()
        const artists = new Set<string>()

        for (const track of tracks) {
            if (track.author) {
                artists.add(track.author)
            }
            // Genre extraction would need to be implemented
        }

        return {
            totalTracks,
            totalDuration,
            averageDuration,
            genres: Array.from(genres),
            artists: Array.from(artists)
        }
    } catch (error) {
        debugLog({ message: 'Error getting queue stats:', error })
        return {
            totalTracks: 0,
            totalDuration: 0,
            averageDuration: 0,
            genres: [],
            artists: []
        }
    }
}

/**
 * Get next track in queue
 */
export function getNextTrack(queue: GuildQueue): Track | null {
    try {
        const tracks = queue.tracks.toArray()
        return tracks.length > 0 ? tracks[0] : null
    } catch (error) {
        debugLog({ message: 'Error getting next track:', error })
        return null
    }
}

/**
 * Get track at specific position
 */
export function getTrackAtPosition(queue: GuildQueue, position: number): Track | null {
    try {
        const tracks = queue.tracks.toArray()
        if (position < 0 || position >= tracks.length) {
            return null
        }
        return tracks[position]
    } catch (error) {
        debugLog({ message: 'Error getting track at position:', error })
        return null
    }
}

/**
 * Check if track exists in queue
 */
export function isTrackInQueue(queue: GuildQueue, trackId: string): boolean {
    try {
        const tracks = queue.tracks.toArray()
        return tracks.some(track => track.id === trackId || track.url === trackId)
    } catch (error) {
        debugLog({ message: 'Error checking if track is in queue:', error })
        return false
    }
}

/**
 * Get queue position of a track
 */
export function getTrackPosition(queue: GuildQueue, trackId: string): number {
    try {
        const tracks = queue.tracks.toArray()
        const index = tracks.findIndex(track => track.id === trackId || track.url === trackId)
        return index >= 0 ? index : -1
    } catch (error) {
        debugLog({ message: 'Error getting track position:', error })
        return -1
    }
}
