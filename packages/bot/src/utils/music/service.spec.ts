import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { Track, GuildQueue } from 'discord-player'
import type { User } from 'discord.js'
import { TrackManagementService } from './service'

const debugLogMock = jest.fn()
const errorLogMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    trackHistoryService: {
        clearAllGuildCaches: jest.fn(),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('./queueOperations', () => ({
    addTrackToQueue: jest.fn(),
    addTracksToQueue: jest.fn(),
    clearQueue: jest.fn(),
    shuffleQueue: jest.fn(),
    removeTrackFromQueue: jest.fn(),
    moveTrackInQueue: jest.fn(),
}))

jest.mock('./queueStateManager', () => ({
    getQueueState: jest.fn(),
    getQueueStats: jest.fn(),
    isQueueEmpty: jest.fn(),
    isQueueFull: jest.fn(),
}))

// Import mocked modules
import * as queueOps from './queueOperations'
import * as queueStateMgr from './queueStateManager'
import { trackHistoryService } from '@lucky/shared/services'

const queueOpsMock = queueOps as unknown as Record<string, jest.Mock>
const queueStateMgrMock = queueStateMgr as unknown as Record<string, jest.Mock>
const trackHistoryServiceMock = trackHistoryService as unknown as Record<string, jest.Mock>

function createTrack(id: string, title: string): Track {
    return {
        id,
        title,
        author: 'Test Artist',
        url: `https://example.com/${id}`,
        duration: 180000,
        requestedBy: { id: 'user-1' } as User,
        metadata: {},
    } as any
}

function createUser(id: string, username: string): User {
    return {
        id,
        username,
    } as User
}

function createQueue(trackCount = 3): GuildQueue {
    const currentTrack = createTrack('current', 'Current Song')
    const upcomingTracks = Array.from({ length: trackCount - 1 }, (_, i) =>
        createTrack(`track-${i + 1}`, `Song ${i + 1}`),
    )

    return {
        guild: { id: 'guild-123' },
        currentTrack,
        tracks: {
            toArray: jest.fn(() => upcomingTracks),
        },
        node: {
            isPlaying: jest.fn(() => true),
            isPaused: jest.fn(() => false),
            pause: jest.fn(),
            resume: jest.fn(),
            play: jest.fn(),
            stop: jest.fn(),
        },
        addTrack: jest.fn(),
        addTracks: jest.fn(),
    } as any
}

describe('TrackManagementService', () => {
    let service: TrackManagementService
    let queue: GuildQueue

    beforeEach(() => {
        jest.clearAllMocks()
        service = new TrackManagementService()
        queue = createQueue()
    })

    describe('constructor', () => {
        it('initializes with default options', () => {
            const defaultService = new TrackManagementService()
            const options = defaultService.getOptions()

            expect(options.maxQueueSize).toBe(100)
            expect(options.allowDuplicates).toBe(false)
            expect(options.duplicateThreshold).toBe(0.8)
            expect(options.autoShuffle).toBe(false)
            expect(options.priorityWeight).toBe(1.0)
        })

        it('initializes with custom options', () => {
            const customService = new TrackManagementService({
                maxQueueSize: 50,
                allowDuplicates: true,
                priorityWeight: 2.0,
            })
            const options = customService.getOptions()

            expect(options.maxQueueSize).toBe(50)
            expect(options.allowDuplicates).toBe(true)
            expect(options.priorityWeight).toBe(2.0)
            expect(options.duplicateThreshold).toBe(0.8) // Default preserved
        })

        it('merges custom and default options', () => {
            const customService = new TrackManagementService({
                maxQueueSize: 75,
            })
            const options = customService.getOptions()

            expect(options.maxQueueSize).toBe(75)
            expect(options.allowDuplicates).toBe(false) // Default
            expect(options.autoShuffle).toBe(false) // Default
        })
    })

    describe('addTrackToQueue', () => {
        it('adds a single track successfully', async () => {
            const track = createTrack('track-1', 'Test Song')
            queueOpsMock.addTrackToQueue.mockResolvedValue({
                success: true,
                tracksAdded: 1,
                tracksSkipped: 0,
                message: 'Track added',
            })

            const result = await service.addTrackToQueue(queue, track)

            expect(result.success).toBe(true)
            expect(result.tracksAdded).toBe(1)
            expect(result.tracksSkipped).toBe(0)
            expect(queueOpsMock.addTrackToQueue).toHaveBeenCalledWith(
                queue,
                track,
                expect.objectContaining({
                    playNext: false,
                    skipDuplicates: true,
                }),
                expect.any(Object),
            )
        })

        it('handles duplicate rejection based on allowDuplicates option', async () => {
            const serviceAllowDupes = new TrackManagementService({
                allowDuplicates: true,
            })
            const track = createTrack('track-1', 'Test Song')
            queueOpsMock.addTrackToQueue.mockResolvedValue({
                success: true,
                tracksAdded: 1,
                tracksSkipped: 0,
            })

            await serviceAllowDupes.addTrackToQueue(queue, track)

            expect(queueOpsMock.addTrackToQueue).toHaveBeenCalledWith(
                expect.any(Object),
                expect.any(Object),
                expect.objectContaining({
                    skipDuplicates: false,
                }),
                expect.any(Object),
            )
        })

        it('returns error result on exception', async () => {
            const track = createTrack('track-1', 'Test Song')
            const testError = new Error('Queue operation failed')
            queueOpsMock.addTrackToQueue.mockRejectedValue(testError)

            const result = await service.addTrackToQueue(queue, track)

            expect(result.success).toBe(false)
            expect(result.tracksAdded).toBe(0)
            expect(result.tracksSkipped).toBe(1)
            expect(result.error).toBe('Queue operation failed')
            expect(errorLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Error adding track to queue:',
                    error: testError,
                }),
            )
        })

        it('handles unknown errors gracefully', async () => {
            const track = createTrack('track-1', 'Test Song')
            queueOpsMock.addTrackToQueue.mockRejectedValue('Unknown error')

            const result = await service.addTrackToQueue(queue, track)

            expect(result.success).toBe(false)
            expect(result.error).toBe('Unknown error')
        })

        it('preserves requester from track metadata', async () => {
            const track = createTrack('track-1', 'Test Song')
            const requester = createUser('user-123', 'TestUser')
            track.requestedBy = requester
            queueOpsMock.addTrackToQueue.mockResolvedValue({
                success: true,
                tracksAdded: 1,
                tracksSkipped: 0,
            })

            await service.addTrackToQueue(queue, track)

            expect(queueOpsMock.addTrackToQueue).toHaveBeenCalledWith(
                expect.any(Object),
                expect.any(Object),
                expect.objectContaining({
                    requester,
                }),
                expect.any(Object),
            )
        })
    })

    describe('addTracksToQueue', () => {
        it('adds multiple tracks successfully', async () => {
            const tracks = [
                createTrack('track-1', 'Song 1'),
                createTrack('track-2', 'Song 2'),
            ]
            const requester = createUser('user-1', 'TestUser')
            queueOpsMock.addTracksToQueue.mockResolvedValue({
                success: true,
                tracksAdded: 2,
                tracksSkipped: 0,
                message: 'Tracks added',
            })

            const result = await service.addTracksToQueue(
                queue,
                tracks,
                true,
                requester,
            )

            expect(result.success).toBe(true)
            expect(result.tracksAdded).toBe(2)
            expect(result.tracksSkipped).toBe(0)
            expect(queueOpsMock.addTracksToQueue).toHaveBeenCalledWith(
                queue,
                tracks,
                expect.objectContaining({
                    playNext: true,
                    requester,
                    skipDuplicates: true,
                    maxTracks: 100,
                }),
                expect.any(Object),
            )
        })

        it('respects maxQueueSize from options', async () => {
            const serviceWithLimit = new TrackManagementService({
                maxQueueSize: 50,
            })
            const tracks = [createTrack('track-1', 'Song 1')]
            const requester = createUser('user-1', 'TestUser')
            queueOpsMock.addTracksToQueue.mockResolvedValue({
                success: true,
                tracksAdded: 1,
                tracksSkipped: 0,
            })

            await serviceWithLimit.addTracksToQueue(queue, tracks, false, requester)

            expect(queueOpsMock.addTracksToQueue).toHaveBeenCalledWith(
                expect.any(Object),
                expect.any(Object),
                expect.objectContaining({
                    maxTracks: 50,
                }),
                expect.any(Object),
            )
        })

        it('handles empty track list', async () => {
            const requester = createUser('user-1', 'TestUser')
            queueOpsMock.addTracksToQueue.mockResolvedValue({
                success: true,
                tracksAdded: 0,
                tracksSkipped: 0,
            })

            const result = await service.addTracksToQueue(queue, [], false, requester)

            expect(result.tracksAdded).toBe(0)
            expect(result.tracksSkipped).toBe(0)
        })

        it('returns error result on exception', async () => {
            const tracks = [
                createTrack('track-1', 'Song 1'),
                createTrack('track-2', 'Song 2'),
            ]
            const requester = createUser('user-1', 'TestUser')
            const testError = new Error('Queue operation failed')
            queueOpsMock.addTracksToQueue.mockRejectedValue(testError)

            const result = await service.addTracksToQueue(
                queue,
                tracks,
                false,
                requester,
            )

            expect(result.success).toBe(false)
            expect(result.tracksAdded).toBe(0)
            expect(result.tracksSkipped).toBe(2)
            expect(result.error).toBe('Queue operation failed')
            expect(errorLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Error adding tracks to queue:',
                }),
            )
        })

        it('passes skipDuplicates based on allowDuplicates option', async () => {
            const serviceAllowDupes = new TrackManagementService({
                allowDuplicates: true,
            })
            const tracks = [createTrack('track-1', 'Song 1')]
            const requester = createUser('user-1', 'TestUser')
            queueOpsMock.addTracksToQueue.mockResolvedValue({
                success: true,
                tracksAdded: 1,
                tracksSkipped: 0,
            })

            await serviceAllowDupes.addTracksToQueue(queue, tracks, false, requester)

            expect(queueOpsMock.addTracksToQueue).toHaveBeenCalledWith(
                expect.any(Object),
                expect.any(Object),
                expect.objectContaining({
                    skipDuplicates: false,
                }),
                expect.any(Object),
            )
        })
    })

    describe('manageQueue', () => {
        it('orchestrates queue management and returns wasPlaying status', async () => {
            const tracksToAdd = [
                createTrack('track-1', 'Song 1'),
                createTrack('track-2', 'Song 2'),
            ]
            const requester = { user: { id: 'user-123' } } as any
            queue.node.isPlaying = jest.fn(() => true)
            queueOpsMock.addTracksToQueue.mockResolvedValue({
                success: true,
                tracksAdded: 2,
                tracksSkipped: 0,
            })

            const result = await service.manageQueue(
                queue,
                tracksToAdd,
                true,
                requester,
            )

            expect(result.wasPlaying).toBe(true)
            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Managing queue',
                }),
            )
        })

        it('logs failure when tracks fail to add', async () => {
            const tracksToAdd = [createTrack('track-1', 'Song 1')]
            const requester = { user: { id: 'user-123' } } as any
            queue.node.isPlaying = jest.fn(() => false)
            queueOpsMock.addTracksToQueue.mockResolvedValue({
                success: false,
                tracksAdded: 0,
                tracksSkipped: 1,
                error: 'Test error',
            })

            await service.manageQueue(queue, tracksToAdd, false, requester)

            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Failed to add tracks to queue',
                }),
            )
        })

        it('returns wasPlaying false on exception', async () => {
            const tracksToAdd = [createTrack('track-1', 'Song 1')]
            const requester = { user: { id: 'user-123' } } as any
            queue.node.isPlaying = jest.fn(() => false)
            queueOpsMock.addTracksToQueue.mockRejectedValue(new Error('Test error'))

            const result = await service.manageQueue(
                queue,
                tracksToAdd,
                false,
                requester,
            )

            expect(result.wasPlaying).toBe(false)
            expect(errorLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Error adding tracks to queue:',
                }),
            )
        })

        it('captures wasPlaying status before any operations', async () => {
            const tracksToAdd = [createTrack('track-1', 'Song 1')]
            const requester = { user: { id: 'user-123' } } as any
            queue.node.isPlaying = jest.fn(() => true)
            queueOpsMock.addTracksToQueue.mockResolvedValue({
                success: true,
                tracksAdded: 1,
                tracksSkipped: 0,
            })

            const result = await service.manageQueue(
                queue,
                tracksToAdd,
                true,
                requester,
            )

            expect(result.wasPlaying).toBe(true)
            expect(queue.node.isPlaying).toHaveBeenCalled()
        })
    })

    describe('clearGuildHistory', () => {
        it('clears guild cache successfully', async () => {
            trackHistoryServiceMock.clearAllGuildCaches.mockResolvedValue(undefined)

            await service.clearGuildHistory('guild-123')

            expect(trackHistoryServiceMock.clearAllGuildCaches).toHaveBeenCalledWith(
                'guild-123',
            )
            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Cleared guild history',
                    data: { guildId: 'guild-123' },
                }),
            )
        })

        it('handles errors when clearing history', async () => {
            const testError = new Error('Cache clear failed')
            trackHistoryServiceMock.clearAllGuildCaches.mockRejectedValue(testError)

            await service.clearGuildHistory('guild-123')

            expect(errorLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Error clearing guild history:',
                    error: testError,
                }),
            )
        })

        it('passes correct guild ID to history service', async () => {
            trackHistoryServiceMock.clearAllGuildCaches.mockResolvedValue(undefined)

            await service.clearGuildHistory('guild-999')

            expect(trackHistoryServiceMock.clearAllGuildCaches).toHaveBeenCalledWith(
                'guild-999',
            )
        })
    })

    describe('getQueueState', () => {
        it('delegates to queueStateManager', () => {
            const mockState = {
                isPlaying: true,
                isPaused: false,
                queueSize: 5,
                repeatMode: 'off',
                volume: 100,
                position: 30,
                duration: 180,
            }
            queueStateMgrMock.getQueueState.mockReturnValue(mockState)

            const result = service.getQueueState(queue)

            expect(result).toEqual(mockState)
        })
    })

    describe('getQueueStats', () => {
        it('delegates to queueStateManager', () => {
            const mockStats = {
                totalTracks: 5,
                totalDuration: 900000,
                averageTrackDuration: 180000,
            }
            queueStateMgrMock.getQueueStats.mockReturnValue(mockStats)

            const result = service.getQueueStats(queue)

            expect(result).toEqual(mockStats)
        })
    })

    describe('isQueueEmpty', () => {
        it('returns true for empty queue', () => {
            queueStateMgrMock.isQueueEmpty.mockReturnValue(true)

            const result = service.isQueueEmpty(queue)

            expect(result).toBe(true)
        })
    })

    describe('isQueueFull', () => {
        it('uses custom maxQueueSize from options', () => {
            const customService = new TrackManagementService({
                maxQueueSize: 50,
            })
            queueStateMgrMock.isQueueFull.mockReturnValue(true)

            const result = customService.isQueueFull(queue)

            expect(result).toBe(true)
        })
    })

    describe('clearQueue', () => {
        it('returns false when clear fails', async () => {
            queueOpsMock.clearQueue.mockResolvedValue(false)

            const result = await service.clearQueue(queue)

            expect(result).toBe(false)
        })
    })

    describe('shuffleQueue', () => {
        it('returns false when shuffle fails', async () => {
            queueOpsMock.shuffleQueue.mockResolvedValue(false)

            const result = await service.shuffleQueue(queue)

            expect(result).toBe(false)
        })
    })

    describe('removeTrackFromQueue', () => {
        it('returns null when track not found', async () => {
            queueOpsMock.removeTrackFromQueue.mockResolvedValue(null)

            const result = await service.removeTrackFromQueue(queue, 99)

            expect(result).toBeNull()
        })
    })

    describe('moveTrackInQueue', () => {
        it('returns null when move operation fails', async () => {
            queueOpsMock.moveTrackInQueue.mockResolvedValue(null)

            const result = await service.moveTrackInQueue(queue, 5, 10)

            expect(result).toBeNull()
        })
    })

    describe('updateOptions', () => {
        it('updates partial options', () => {
            service.updateOptions({
                maxQueueSize: 200,
                autoShuffle: true,
            })

            const options = service.getOptions()
            expect(options.maxQueueSize).toBe(200)
            expect(options.autoShuffle).toBe(true)
            expect(options.allowDuplicates).toBe(false) // Unchanged
        })

        it('preserves unspecified options', () => {
            service.updateOptions({ priorityWeight: 2.0 })

            const options = service.getOptions()
            expect(options.priorityWeight).toBe(2.0)
            expect(options.maxQueueSize).toBe(100)
            expect(options.allowDuplicates).toBe(false)
        })


        it('allows multiple sequential updates', () => {
            service.updateOptions({ maxQueueSize: 150 })
            service.updateOptions({ allowDuplicates: true })

            const options = service.getOptions()
            expect(options.maxQueueSize).toBe(150)
            expect(options.allowDuplicates).toBe(true)
        })
    })

    describe('getOptions', () => {
        it('returns a copy of options', () => {
            const options1 = service.getOptions()
            const options2 = service.getOptions()

            expect(options1).toEqual(options2)
            expect(options1).not.toBe(options2) // Different object references
        })

        it('reflects updates after updateOptions', () => {
            service.updateOptions({ maxQueueSize: 200 })
            const options = service.getOptions()

            expect(options.maxQueueSize).toBe(200)
        })

        it('returns all default option properties', () => {
            const options = service.getOptions()

            expect(options).toHaveProperty('maxQueueSize')
            expect(options).toHaveProperty('allowDuplicates')
            expect(options).toHaveProperty('duplicateThreshold')
            expect(options).toHaveProperty('autoShuffle')
            expect(options).toHaveProperty('priorityWeight')
        })
    })

    describe('integration scenarios', () => {
        it('handles complete track management workflow', async () => {
            const tracks = [
                createTrack('track-1', 'Song 1'),
                createTrack('track-2', 'Song 2'),
            ]
            const requester = createUser('user-1', 'TestUser')

            // Simulate adding tracks
            queueOpsMock.addTracksToQueue.mockResolvedValue({
                success: true,
                tracksAdded: 2,
                tracksSkipped: 0,
            })

            const addResult = await service.addTracksToQueue(
                queue,
                tracks,
                false,
                requester,
            )
            expect(addResult.success).toBe(true)

            // Simulate getting queue state
            queueStateMgrMock.isQueueEmpty.mockReturnValue(false)
            const isEmpty = service.isQueueEmpty(queue)
            expect(isEmpty).toBe(false)

            // Simulate removing a track
            const removedTrack = createTrack('track-1', 'Song 1')
            queueOpsMock.removeTrackFromQueue.mockResolvedValue(removedTrack)
            const result = await service.removeTrackFromQueue(queue, 0)
            expect(result).toEqual(removedTrack)
        })

        it('handles multiple service instances independently', () => {
            const service1 = new TrackManagementService({ maxQueueSize: 100 })
            const service2 = new TrackManagementService({ maxQueueSize: 50 })

            service1.updateOptions({ allowDuplicates: true })

            const options1 = service1.getOptions()
            const options2 = service2.getOptions()

            expect(options1.maxQueueSize).toBe(100)
            expect(options1.allowDuplicates).toBe(true)
            expect(options2.maxQueueSize).toBe(50)
            expect(options2.allowDuplicates).toBe(false)
        })

        it('maintains state consistency across operations', async () => {
            const initialOptions = service.getOptions()

            service.updateOptions({ maxQueueSize: 150 })
            const updatedOptions = service.getOptions()

            expect(initialOptions.maxQueueSize).toBe(100)
            expect(updatedOptions.maxQueueSize).toBe(150)

            service.updateOptions({ allowDuplicates: true })
            const finalOptions = service.getOptions()

            expect(finalOptions.maxQueueSize).toBe(150)
            expect(finalOptions.allowDuplicates).toBe(true)
        })
    })
})
