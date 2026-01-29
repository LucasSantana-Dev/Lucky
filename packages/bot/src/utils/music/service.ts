import type { Track, GuildQueue } from 'discord-player'
import type { User } from 'discord.js'
import type {
    TrackManagementResult,
    TrackManagementOptions,
    QueueState,
    QueueManagementOptions
} from './types'
import { addTracksToQueue, addTrackToQueue, clearQueue, shuffleQueue, removeTrackFromQueue, moveTrackInQueue } from './queueOperations'
import { getQueueState, getQueueStats, isQueueEmpty, isQueueFull } from './queueStateManager'
import { ServiceFactory } from '../../../../../../src/services/ServiceFactory'
import { debugLog, errorLog } from '@lukbot/shared/utils'

/**
 * Main Track Management Service
 * Orchestrates track management operations using modular components
 */
export class TrackManagementService {
    private readonly options: TrackManagementOptions

    constructor(options: TrackManagementOptions = {}) {
        this.options = {
            maxQueueSize: 100,
            allowDuplicates: false,
            duplicateThreshold: 0.8,
            autoShuffle: false,
            priorityWeight: 1.0,
            ...options
        }
    }

    /**
     * Add a single track to queue
     */
    async addTrackToQueue(
        queue: GuildQueue,
        track: Track
    ): Promise<TrackManagementResult> {
        try {
            const options: QueueManagementOptions = {
                playNext: false,
                requester: track.requestedBy as User,
                skipDuplicates: !this.options.allowDuplicates
            }

            const result = await addTrackToQueue(queue, track, options, this.options)

            return {
                success: result.success,
                tracksAdded: result.tracksAdded,
                tracksSkipped: result.tracksSkipped,
                message: result.message,
                error: result.error
            }
        } catch (error) {
            errorLog({ message: 'Error adding track to queue:', error })
            return {
                success: false,
                tracksAdded: 0,
                tracksSkipped: 1,
                error: error instanceof Error ? error.message : 'Unknown error'
            }
        }
    }

    /**
     * Add multiple tracks to queue
     */
    async addTracksToQueue(
        queue: GuildQueue,
        tracks: Track[],
        playNext: boolean,
        requester: User
    ): Promise<TrackManagementResult> {
        try {
            const options: QueueManagementOptions = {
                playNext,
                requester,
                skipDuplicates: !this.options.allowDuplicates,
                maxTracks: this.options.maxQueueSize
            }

            const result = await addTracksToQueue(queue, tracks, options, this.options)

            return {
                success: result.success,
                tracksAdded: result.tracksAdded,
                tracksSkipped: result.tracksSkipped,
                message: result.message,
                error: result.error
            }
        } catch (error) {
            errorLog({ message: 'Error adding tracks to queue:', error })
            return {
                success: false,
                tracksAdded: 0,
                tracksSkipped: tracks.length,
                error: error instanceof Error ? error.message : 'Unknown error'
            }
        }
    }

    /**
     * Manage queue with tracks
     */
    async manageQueue(
        queue: GuildQueue,
        tracksToAdd: Track[],
        playNext: boolean,
        requester: { user: { id: string } }
    ): Promise<{ wasPlaying: boolean }> {
        try {
            const wasPlaying = queue.node.isPlaying()

            debugLog({
                message: 'Managing queue',
                data: {
                    tracksToAdd: tracksToAdd.length,
                    playNext,
                    wasPlaying,
                    requester: requester.user.id
                }
            })

            // Add tracks to queue
            const result = await this.addTracksToQueue(
                queue,
                tracksToAdd,
                playNext,
                requester.user as User
            )

            if (!result.success) {
                debugLog({ message: 'Failed to add tracks to queue', data: { result } })
            }

            return { wasPlaying }
        } catch (error) {
            errorLog({ message: 'Error managing queue:', error })
            return { wasPlaying: false }
        }
    }

    /**
     * Clear guild history
     */
    async clearGuildHistory(guildId: string): Promise<void> {
        try {
            const trackHistoryService = ServiceFactory.getTrackHistoryService()
            await trackHistoryService.clearAllGuildCaches(guildId)
            debugLog({ message: 'Cleared guild history', data: { guildId } })
        } catch (error) {
            errorLog({ message: 'Error clearing guild history:', error })
        }
    }

    /**
     * Get current queue state
     */
    getQueueState(queue: GuildQueue): QueueState {
        return getQueueState(queue)
    }

    /**
     * Get queue statistics
     */
    getQueueStats(queue: GuildQueue) {
        return getQueueStats(queue)
    }

    /**
     * Check if queue is empty
     */
    isQueueEmpty(queue: GuildQueue): boolean {
        return isQueueEmpty(queue)
    }

    /**
     * Check if queue is full
     */
    isQueueFull(queue: GuildQueue): boolean {
        return isQueueFull(queue, this.options.maxQueueSize)
    }

    /**
     * Clear queue
     */
    async clearQueue(queue: GuildQueue): Promise<boolean> {
        return clearQueue(queue)
    }

    /**
     * Shuffle queue
     */
    async shuffleQueue(queue: GuildQueue): Promise<boolean> {
        return shuffleQueue(queue)
    }

    /**
     * Remove track from queue
     */
    async removeTrackFromQueue(queue: GuildQueue, position: number): Promise<Track | null> {
        return removeTrackFromQueue(queue, position)
    }

    /**
     * Move track in queue
     */
    async moveTrackInQueue(queue: GuildQueue, from: number, to: number): Promise<Track | null> {
        return moveTrackInQueue(queue, from, to)
    }

    /**
     * Update service options
     */
    updateOptions(newOptions: Partial<TrackManagementOptions>): void {
        Object.assign(this.options, newOptions)
        debugLog({ message: 'Updated track management options', data: { options: this.options } })
    }

    /**
     * Get current options
     */
    getOptions(): TrackManagementOptions {
        return { ...this.options }
    }
}
