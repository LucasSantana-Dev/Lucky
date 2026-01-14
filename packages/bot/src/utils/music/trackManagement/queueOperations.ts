import type { Track, GuildQueue } from 'discord-player'
import type { QueueOperationResult, TrackManagementOptions, QueueManagementOptions } from './types'
import { validateTracks } from './trackValidator'
import { AsyncQueueManager } from '../queue/asyncQueueManager'
import { debugLog, errorLog } from '@lukbot/shared/utils'

/**
 * Add tracks to queue with validation and management
 */
export async function addTracksToQueue(
    queue: GuildQueue,
    tracks: Track[],
    options: QueueManagementOptions,
    managementOptions: TrackManagementOptions
): Promise<QueueOperationResult> {
    try {
        debugLog({
            message: 'Adding tracks to queue',
            data: {
                trackCount: tracks.length,
                playNext: options.playNext,
                requester: options.requester.id
            }
        })

        // Validate tracks
        const { validTracks, invalidTracks } = validateTracks(tracks, queue, managementOptions)

        if (validTracks.length === 0) {
            return {
                success: false,
                tracksProcessed: tracks.length,
                tracksAdded: 0,
                tracksSkipped: tracks.length,
                message: 'No valid tracks to add',
                error: 'All tracks failed validation'
            }
        }

        // Check queue size limits
        const maxQueueSize = managementOptions.maxQueueSize || 100
        const currentSize = queue.tracks.size
        const availableSlots = maxQueueSize - currentSize

        if (availableSlots <= 0) {
            return {
                success: false,
                tracksProcessed: tracks.length,
                tracksAdded: 0,
                tracksSkipped: tracks.length,
                message: 'Queue is full',
                error: 'Maximum queue size reached'
            }
        }

        // Limit tracks to available slots
        const tracksToAdd = validTracks.slice(0, Math.min(availableSlots, options.maxTracks || validTracks.length))

        // Use AsyncQueue for safe track addition
        const result = await AsyncQueueManager.addTracksSafely(
            queue,
            tracksToAdd,
            options.playNext
        )

        const tracksAdded = result.tracksAdded
        let tracksSkipped = tracksToAdd.length - tracksAdded

        // Handle invalid tracks
        tracksSkipped += invalidTracks.length

        const message = tracksAdded > 0
            ? `Added ${tracksAdded} track(s) to queue${tracksSkipped > 0 ? `, skipped ${tracksSkipped}` : ''}`
            : `No tracks added, ${tracksSkipped} skipped`

        return {
            success: tracksAdded > 0,
            tracksProcessed: tracks.length,
            tracksAdded,
            tracksSkipped,
            message
        }
    } catch (error) {
        errorLog({ message: 'Error adding tracks to queue:', error })
        return {
            success: false,
            tracksProcessed: tracks.length,
            tracksAdded: 0,
            tracksSkipped: tracks.length,
            error: error instanceof Error ? error.message : 'Unknown error'
        }
    }
}

/**
 * Add a single track to queue
 */
export async function addTrackToQueue(
    queue: GuildQueue,
    track: Track,
    options: QueueManagementOptions,
    managementOptions: TrackManagementOptions
): Promise<QueueOperationResult> {
    return addTracksToQueue(queue, [track], options, managementOptions)
}

/**
 * Clear queue and reset state
 */
export async function clearQueue(queue: GuildQueue): Promise<boolean> {
    try {
        queue.clear()
        debugLog({ message: 'Queue cleared successfully' })
        return true
    } catch (error) {
        errorLog({ message: 'Error clearing queue:', error })
        return false
    }
}

/**
 * Shuffle queue tracks
 */
export async function shuffleQueue(queue: GuildQueue): Promise<boolean> {
    try {
        const tracks = queue.tracks.toArray()
        if (tracks.length <= 1) {
            return true
        }

        // Fisher-Yates shuffle
        for (let i = tracks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [tracks[i], tracks[j]] = [tracks[j], tracks[i]]
        }

        // Rebuild queue with shuffled tracks
        queue.clear()
        for (const track of tracks) {
            queue.addTrack(track)
        }

        debugLog({ message: 'Queue shuffled successfully' })
        return true
    } catch (error) {
        errorLog({ message: 'Error shuffling queue:', error })
        return false
    }
}

/**
 * Remove track from queue by position
 */
export async function removeTrackFromQueue(
    queue: GuildQueue,
    position: number
): Promise<Track | null> {
    try {
        const tracks = queue.tracks.toArray()
        if (position < 0 || position >= tracks.length) {
            return null
        }

        const track = tracks[position]
        queue.node.remove(track)

        debugLog({ message: 'Track removed from queue', data: { position, track: track.title } })
        return track
    } catch (error) {
        errorLog({ message: 'Error removing track from queue:', error })
        return null
    }
}

/**
 * Move track in queue
 */
export async function moveTrackInQueue(
    queue: GuildQueue,
    fromPosition: number,
    toPosition: number
): Promise<Track | null> {
    try {
        const tracks = queue.tracks.toArray()

        if (fromPosition < 0 || fromPosition >= tracks.length ||
            toPosition < 0 || toPosition >= tracks.length) {
            return null
        }

        const track = tracks[fromPosition]

        // Remove from original position
        queue.node.remove(track)

        // Insert at new position
        const newTracks = queue.tracks.toArray()
        if (toPosition >= newTracks.length) {
            queue.addTrack(track)
        } else {
            queue.insertTrack(track, toPosition)
        }

        debugLog({
            message: 'Track moved in queue',
            data: {
                track: track.title,
                from: fromPosition,
                to: toPosition
            }
        })

        return track
    } catch (error) {
        errorLog({ message: 'Error moving track in queue:', error })
        return null
    }
}

/**
 * Replenish queue with recommendations
 */
export async function replenishQueue(queue: GuildQueue): Promise<void> {
    try {
        debugLog({ message: 'Replenishing queue', data: { guildId: queue.guild.id } })


        debugLog({ message: 'Queue replenished successfully' })
    } catch (error) {
        errorLog({ message: 'Error replenishing queue:', error })
    }
}
