import type { GuildQueue } from 'discord-player'
import { getTrackInfo } from '../../../../utils/music/trackUtils'
import type { QueueStats } from './types'

/**
 * Calculate queue statistics
 */
export async function calculateQueueStats(
    queue: GuildQueue,
): Promise<QueueStats> {
    const tracks = queue.tracks.toArray()
    const totalTracks = tracks.length

    // Calculate total duration
    let totalDurationMs = 0
    for (const track of tracks) {
        const trackInfo = await getTrackInfo(track)
        if (trackInfo.duration) {
            // Convert duration string to milliseconds if needed
            const durationMs = parseDurationToMs(trackInfo.duration)
            if (durationMs !== null && durationMs > 0) {
                totalDurationMs += durationMs
            }
        }
    }

    const totalDuration = formatDuration(totalDurationMs)

    return {
        totalTracks,
        totalDuration,
        currentPosition: queue.node.getTimestamp()?.current.value ?? 0,
        isLooping: queue.repeatMode === 1, // Track loop
        isShuffled: false, // TODO: Check if shuffle is enabled
        autoplayEnabled: queue.repeatMode === 2, // Queue loop
    }
}

/**
 * Parse duration string to milliseconds
 */
function parseDurationToMs(duration: string): number | null {
    const parts = duration.split(':')
    if (parts.length === 2) {
        const minutes = parseInt(parts[0], 10)
        const seconds = parseInt(parts[1], 10)
        return (minutes * 60 + seconds) * 1000
    }
    return null
}

/**
 * Format duration in milliseconds to readable format
 */
function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
        return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
    }
    return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`
}

/**
 * Get queue status information
 */
export function getQueueStatus(queue: GuildQueue): string {
    const status = []

    if (queue.repeatMode === 1) status.push('🔁 Loop')
    if (queue.repeatMode === 2) status.push('🔄 Autoplay')
    // TODO: Check if shuffle is enabled
    // if (queue.tracks.shuffle) status.push("🔀 Shuffle")
    if (queue.node.isPaused()) status.push('⏸️ Paused')

    return status.length > 0 ? status.join(' • ') : '▶️ Playing'
}
