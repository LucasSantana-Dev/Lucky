import type { Track, GuildQueue } from 'discord-player'
import type { QueueOperationResult, TrackManagementOptions, QueueManagementOptions } from './types'
import { validateTracks } from './trackValidator'
import { AsyncQueueManager } from './queue/asyncQueueManager'
import { debugLog, errorLog } from '@lukbot/shared/utils'
export { clearQueue, shuffleQueue, removeTrackFromQueue, moveTrackInQueue, replenishQueue } from './queueManipulation'

export async function addTracksToQueue(
    queue: GuildQueue,
    tracks: Track[],
    options: QueueManagementOptions,
    managementOptions: TrackManagementOptions
): Promise<QueueOperationResult> {
    try {
        debugLog({ message: 'Adding tracks to queue', data: { trackCount: tracks.length, playNext: options.playNext, requester: options.requester.id } })

        const { validTracks, invalidTracks } = validateTracks(tracks, queue, managementOptions)

        if (validTracks.length === 0) {
            return { success: false, tracksProcessed: tracks.length, tracksAdded: 0, tracksSkipped: tracks.length, message: 'No valid tracks to add', error: 'All tracks failed validation' }
        }

        const maxQueueSize = managementOptions.maxQueueSize || 100
        const availableSlots = maxQueueSize - queue.tracks.size

        if (availableSlots <= 0) {
            return { success: false, tracksProcessed: tracks.length, tracksAdded: 0, tracksSkipped: tracks.length, message: 'Queue is full', error: 'Maximum queue size reached' }
        }

        const tracksToAdd = validTracks.slice(0, Math.min(availableSlots, options.maxTracks || validTracks.length))
        const result = await AsyncQueueManager.addTracksSafely(queue, tracksToAdd, options.playNext)

        const tracksAdded = result.tracksAdded
        const tracksSkipped = (tracksToAdd.length - tracksAdded) + invalidTracks.length
        const message = tracksAdded > 0
            ? `Added ${tracksAdded} track(s) to queue${tracksSkipped > 0 ? `, skipped ${tracksSkipped}` : ''}`
            : `No tracks added, ${tracksSkipped} skipped`

        return { success: tracksAdded > 0, tracksProcessed: tracks.length, tracksAdded, tracksSkipped, message }
    } catch (error) {
        errorLog({ message: 'Error adding tracks to queue:', error })
        return { success: false, tracksProcessed: tracks.length, tracksAdded: 0, tracksSkipped: tracks.length, error: error instanceof Error ? error.message : 'Unknown error' }
    }
}

export async function addTrackToQueue(
    queue: GuildQueue, track: Track, options: QueueManagementOptions, managementOptions: TrackManagementOptions
): Promise<QueueOperationResult> {
    return addTracksToQueue(queue, [track], options, managementOptions)
}
