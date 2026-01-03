import type { GuildQueue, Track } from 'discord-player'
import { debugLog, errorLog } from '../../general/log'

/**
 * AsyncQueue manager for preventing race conditions in queue operations
 * Based on discord-player best practices
 */
export class AsyncQueueManager {
    /**
     * Safely add tracks to queue using AsyncQueue
     */
    static async addTracksSafely(
        queue: GuildQueue,
        tracks: Track[],
        playNext: boolean = false
    ): Promise<{ success: boolean; tracksAdded: number; error?: string }> {
        try {
            let tracksAdded = 0
            let success = false

            // Add tracks to queue directly without complex task queue management
            for (const track of tracks) {
                if (playNext) {
                    queue.insertTrack(track, 0) // Insert at beginning
                } else {
                    queue.addTrack(track) // Add to end
                }
                tracksAdded++
            }

            // If player node was not previously playing, start playback
            if (!queue.isPlaying()) {
                await queue.node.play()
            }

            success = true
            debugLog({
                message: `Successfully added ${tracksAdded} tracks to queue`,
                data: { guildId: queue.guild.id, playNext }
            })

            return { success, tracksAdded }
        } catch (error) {
            errorLog({ message: 'Error in async queue operation:', error })
            return {
                success: false,
                tracksAdded: 0,
                error: error instanceof Error ? error.message : 'Unknown error'
            }
        }
    }

    /**
     * Safely play a single track using AsyncQueue
     */
    static async playTrackSafely(
        queue: GuildQueue,
        track: Track
    ): Promise<{ success: boolean; error?: string }> {
        try {
            // Add track and start playback
            queue.addTrack(track)

            if (!queue.isPlaying()) {
                await queue.node.play()
            }

            debugLog({
                message: 'Successfully started playing track',
                data: { guildId: queue.guild.id, trackTitle: track.title }
            })

            return { success: true }
        } catch (error) {
            errorLog({ message: 'Error playing track safely:', error })
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            }
        }
    }

    /**
     * Safely clear queue using AsyncQueue
     */
    static async clearQueueSafely(queue: GuildQueue): Promise<{ success: boolean; error?: string }> {
        try {
            queue.tracks.clear()
            debugLog({
                message: 'Successfully cleared queue',
                data: { guildId: queue.guild.id }
            })

            return { success: true }
        } catch (error) {
            errorLog({ message: 'Error clearing queue safely:', error })
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            }
        }
    }
}
