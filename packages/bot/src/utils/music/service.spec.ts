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
const trackHistoryServiceMock = trackHistoryService as unknown as Record<
    string,
    jest.Mock
>

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

        it('initializes with custom options and merges defaults', () => {
            const customService = new TrackManagementService({
                maxQueueSize: 75,
                allowDuplicates: true,
                priorityWeight: 2.0,
            })
            const options = customService.getOptions()

            expect(options.maxQueueSize).toBe(75)
            expect(options.allowDuplicates).toBe(true)
            expect(options.priorityWeight).toBe(2.0)
            expect(options.duplicateThreshold).toBe(0.8) // Default preserved
            expect(options.autoShuffle).toBe(false) // Default preserved
        })
    })

    describe('addTrackToQueue', () => {
        it('adds track successfully and respects allowDuplicates option', async () => {
            const track = createTrack('track-1', 'Test Song')
            const requester = createUser('user-123', 'TestUser')
            track.requestedBy = requester
            queueOpsMock.addTrackToQueue.mockResolvedValue({
                success: true,
                tracksAdded: 1,
                tracksSkipped: 0,
            })

            const result = await service.addTrackToQueue(queue, track)

            expect(result.success).toBe(true)
            expect(result.tracksAdded).toBe(1)
            expect(queueOpsMock.addTrackToQueue).toHaveBeenCalledWith(
                queue,
                track,
                expect.objectContaining({
                    playNext: false,
                    skipDuplicates: true,
                    requester,
                }),
                expect.any(Object),
            )

            // Verify allowDuplicates option controls skipDuplicates
            jest.clearAllMocks()
            const serviceAllowDupes = new TrackManagementService({
                allowDuplicates: true,
            })
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

        it('handles errors and returns failure result', async () => {
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
    })

    describe('addTracksToQueue', () => {
        it('adds multiple tracks with correct options and respects service config', async () => {
            const tracks = [
                createTrack('track-1', 'Song 1'),
                createTrack('track-2', 'Song 2'),
            ]
            const requester = createUser('user-1', 'TestUser')
            queueOpsMock.addTracksToQueue.mockResolvedValue({
                success: true,
                tracksAdded: 2,
                tracksSkipped: 0,
            })

            const result = await service.addTracksToQueue(
                queue,
                tracks,
                true,
                requester,
            )

            expect(result.success).toBe(true)
            expect(result.tracksAdded).toBe(2)
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

            // Verify maxQueueSize and allowDuplicates options
            jest.clearAllMocks()
            const serviceWithLimit = new TrackManagementService({
                maxQueueSize: 50,
                allowDuplicates: true,
            })
            queueOpsMock.addTracksToQueue.mockResolvedValue({
                success: true,
                tracksAdded: 1,
                tracksSkipped: 0,
            })
            await serviceWithLimit.addTracksToQueue(
                queue,
                [tracks[0]],
                false,
                requester,
            )
            expect(queueOpsMock.addTracksToQueue).toHaveBeenCalledWith(
                expect.any(Object),
                expect.any(Object),
                expect.objectContaining({
                    maxTracks: 50,
                    skipDuplicates: false,
                }),
                expect.any(Object),
            )
        })

        it('handles errors and empty lists', async () => {
            const requester = createUser('user-1', 'TestUser')
            queueOpsMock.addTracksToQueue.mockResolvedValue({
                success: true,
                tracksAdded: 0,
                tracksSkipped: 0,
            })

            const emptyResult = await service.addTracksToQueue(
                queue,
                [],
                false,
                requester,
            )
            expect(emptyResult.tracksAdded).toBe(0)

            jest.clearAllMocks()
            const tracks = [
                createTrack('track-1', 'Song 1'),
                createTrack('track-2', 'Song 2'),
            ]
            const testError = new Error('Queue operation failed')
            queueOpsMock.addTracksToQueue.mockRejectedValue(testError)

            const result = await service.addTracksToQueue(
                queue,
                tracks,
                false,
                requester,
            )
            expect(result.success).toBe(false)
            expect(result.tracksSkipped).toBe(2)
            expect(result.error).toBe('Queue operation failed')
        })
    })

    describe('manageQueue', () => {
        it('returns wasPlaying status and handles success/failure cases', async () => {
            const tracksToAdd = [createTrack('track-1', 'Song 1')]
            const requester = { user: { id: 'user-123' } } as any

            // Success case with queue playing
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
            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Managing queue',
                }),
            )

            // Failure case with queue not playing
            jest.clearAllMocks()
            queue.node.isPlaying = jest.fn(() => false)
            queueOpsMock.addTracksToQueue.mockResolvedValue({
                success: false,
                tracksAdded: 0,
                tracksSkipped: 1,
            })

            const failResult = await service.manageQueue(
                queue,
                tracksToAdd,
                false,
                requester,
            )
            expect(failResult.wasPlaying).toBe(false)
            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Failed to add tracks to queue',
                }),
            )
        })

        it('handles exceptions and returns wasPlaying false', async () => {
            const tracksToAdd = [createTrack('track-1', 'Song 1')]
            const requester = { user: { id: 'user-123' } } as any
            queue.node.isPlaying = jest.fn(() => false)
            queueOpsMock.addTracksToQueue.mockRejectedValue(
                new Error('Test error'),
            )

            const result = await service.manageQueue(
                queue,
                tracksToAdd,
                false,
                requester,
            )

            expect(result.wasPlaying).toBe(false)
            expect(errorLogMock).toHaveBeenCalled()
        })
    })

    describe('clearGuildHistory', () => {
        it('clears guild cache and handles errors with guild ID passed correctly', async () => {
            trackHistoryServiceMock.clearAllGuildCaches.mockResolvedValue(
                undefined,
            )

            await service.clearGuildHistory('guild-123')

            expect(
                trackHistoryServiceMock.clearAllGuildCaches,
            ).toHaveBeenCalledWith('guild-123')
            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Cleared guild history',
                    data: { guildId: 'guild-123' },
                }),
            )

            jest.clearAllMocks()
            const testError = new Error('Cache clear failed')
            trackHistoryServiceMock.clearAllGuildCaches.mockRejectedValue(
                testError,
            )

            await service.clearGuildHistory('guild-999')

            expect(errorLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Error clearing guild history:',
                    error: testError,
                }),
            )
            expect(
                trackHistoryServiceMock.clearAllGuildCaches,
            ).toHaveBeenCalledWith('guild-999')
        })
    })

    describe('updateOptions', () => {
        it('updates partial options and preserves defaults across multiple updates', () => {
            service.updateOptions({
                maxQueueSize: 200,
                autoShuffle: true,
            })

            let options = service.getOptions()
            expect(options.maxQueueSize).toBe(200)
            expect(options.autoShuffle).toBe(true)
            expect(options.allowDuplicates).toBe(false)

            service.updateOptions({ priorityWeight: 2.0 })
            options = service.getOptions()
            expect(options.priorityWeight).toBe(2.0)
            expect(options.maxQueueSize).toBe(200)

            service.updateOptions({ allowDuplicates: true })
            options = service.getOptions()
            expect(options.allowDuplicates).toBe(true)
            expect(options.maxQueueSize).toBe(200)
        })
    })

    describe('getOptions', () => {
        it('returns a copy with all properties and reflects updates', () => {
            const options1 = service.getOptions()
            const options2 = service.getOptions()

            expect(options1).toEqual(options2)
            expect(options1).not.toBe(options2) // Different object references
            expect(options1).toHaveProperty('maxQueueSize')
            expect(options1).toHaveProperty('allowDuplicates')
            expect(options1).toHaveProperty('duplicateThreshold')
            expect(options1).toHaveProperty('autoShuffle')
            expect(options1).toHaveProperty('priorityWeight')

            service.updateOptions({ maxQueueSize: 200 })
            const updated = service.getOptions()
            expect(updated.maxQueueSize).toBe(200)
        })
    })

    describe('integration scenarios', () => {
        it('maintains independent service instances and state consistency', () => {
            const service1 = new TrackManagementService({ maxQueueSize: 100 })
            const service2 = new TrackManagementService({ maxQueueSize: 50 })

            service1.updateOptions({ allowDuplicates: true })

            const options1 = service1.getOptions()
            const options2 = service2.getOptions()

            expect(options1.maxQueueSize).toBe(100)
            expect(options1.allowDuplicates).toBe(true)
            expect(options2.maxQueueSize).toBe(50)
            expect(options2.allowDuplicates).toBe(false)

            service.updateOptions({ maxQueueSize: 150 })
            service.updateOptions({ allowDuplicates: true })

            const finalOptions = service.getOptions()
            expect(finalOptions.maxQueueSize).toBe(150)
            expect(finalOptions.allowDuplicates).toBe(true)
        })
    })
})
