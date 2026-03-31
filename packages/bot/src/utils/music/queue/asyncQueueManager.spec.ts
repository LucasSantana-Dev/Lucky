import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import { AsyncQueueManager } from './asyncQueueManager'

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
}))

function createMockTrack(title: string, id: string = '') {
    return {
        id: id || title,
        title,
        author: 'Artist',
        duration: '3:00',
        source: 'youtube',
    }
}

function createMockQueue(isPlaying: boolean = false) {
    return {
        guild: { id: 'guild-123' },
        isPlaying: jest.fn(() => isPlaying),
        insertTrack: jest.fn(),
        addTrack: jest.fn(),
        tracks: {
            clear: jest.fn(),
        },
        node: {
            play: jest.fn().mockResolvedValue(undefined),
        },
    }
}

describe('AsyncQueueManager', () => {
    describe('addTracksSafely', () => {
        test('adds single track to queue', async () => {
            const queue = createMockQueue()
            const track = createMockTrack('Song A')

            const result = await AsyncQueueManager.addTracksSafely(queue, [
                track,
            ])

            expect(result.success).toBe(true)
            expect(result.tracksAdded).toBe(1)
            expect(result.error).toBeUndefined()
            expect(queue.addTrack).toHaveBeenCalledWith(track)
        })

        test('adds multiple tracks to queue in order', async () => {
            const queue = createMockQueue()
            const tracks = [
                createMockTrack('Song A', 'a'),
                createMockTrack('Song B', 'b'),
                createMockTrack('Song C', 'c'),
            ]

            const result = await AsyncQueueManager.addTracksSafely(
                queue,
                tracks,
            )

            expect(result.success).toBe(true)
            expect(result.tracksAdded).toBe(3)
            expect(queue.addTrack).toHaveBeenCalledTimes(3)
            expect(queue.addTrack).toHaveBeenNthCalledWith(1, tracks[0])
            expect(queue.addTrack).toHaveBeenNthCalledWith(2, tracks[1])
            expect(queue.addTrack).toHaveBeenNthCalledWith(3, tracks[2])
        })

        test('inserts tracks at beginning when playNext is true', async () => {
            const queue = createMockQueue()
            const tracks = [
                createMockTrack('Song A', 'a'),
                createMockTrack('Song B', 'b'),
            ]

            const result = await AsyncQueueManager.addTracksSafely(
                queue,
                tracks,
                true,
            )

            expect(result.success).toBe(true)
            expect(result.tracksAdded).toBe(2)
            expect(queue.insertTrack).toHaveBeenCalledWith(tracks[0], 0)
            expect(queue.insertTrack).toHaveBeenCalledWith(tracks[1], 0)
            expect(queue.addTrack).not.toHaveBeenCalled()
        })

        test('starts playback when queue is not playing', async () => {
            const queue = createMockQueue(false)
            const track = createMockTrack('Song A')

            await AsyncQueueManager.addTracksSafely(queue, [track])

            expect(queue.node.play).toHaveBeenCalled()
        })

        test('does not start playback when queue is already playing', async () => {
            const queue = createMockQueue(true)
            const track = createMockTrack('Song A')

            await AsyncQueueManager.addTracksSafely(queue, [track])

            expect(queue.node.play).not.toHaveBeenCalled()
        })

        test('returns empty array for empty input', async () => {
            const queue = createMockQueue()

            const result = await AsyncQueueManager.addTracksSafely(queue, [])

            expect(result.success).toBe(true)
            expect(result.tracksAdded).toBe(0)
            expect(queue.addTrack).not.toHaveBeenCalled()
        })

        test('handles error when addTrack throws', async () => {
            const queue = createMockQueue()
            const error = new Error('Queue error')
            queue.addTrack.mockImplementation(() => {
                throw error
            })

            const tracks = [createMockTrack('Song A')]
            const result = await AsyncQueueManager.addTracksSafely(
                queue,
                tracks,
            )

            expect(result.success).toBe(false)
            expect(result.tracksAdded).toBe(0)
            expect(result.error).toBe('Queue error')
        })

        test('handles error when insertTrack throws', async () => {
            const queue = createMockQueue()
            const error = new Error('Insert error')
            queue.insertTrack.mockImplementation(() => {
                throw error
            })

            const tracks = [createMockTrack('Song A')]
            const result = await AsyncQueueManager.addTracksSafely(
                queue,
                tracks,
                true,
            )

            expect(result.success).toBe(false)
            expect(result.tracksAdded).toBe(0)
            expect(result.error).toBe('Insert error')
        })

        test('handles unknown error type', async () => {
            const queue = createMockQueue()
            queue.addTrack.mockImplementation(() => {
                throw 'unknown error'
            })

            const tracks = [createMockTrack('Song A')]
            const result = await AsyncQueueManager.addTracksSafely(
                queue,
                tracks,
            )

            expect(result.success).toBe(false)
            expect(result.error).toBe('Unknown error')
        })

        test('handles error when node.play() throws', async () => {
            const queue = createMockQueue(false)
            const error = new Error('Play error')
            queue.node.play.mockRejectedValueOnce(error)

            const tracks = [createMockTrack('Song A')]
            const result = await AsyncQueueManager.addTracksSafely(
                queue,
                tracks,
            )

            expect(result.success).toBe(false)
            expect(result.error).toBe('Play error')
        })
    })

    describe('playTrackSafely', () => {
        test('plays single track successfully', async () => {
            const queue = createMockQueue(false)
            const track = createMockTrack('Song A')

            const result = await AsyncQueueManager.playTrackSafely(queue, track)

            expect(result.success).toBe(true)
            expect(result.error).toBeUndefined()
            expect(queue.addTrack).toHaveBeenCalledWith(track)
            expect(queue.node.play).toHaveBeenCalled()
        })

        test('does not restart playback if already playing', async () => {
            const queue = createMockQueue(true)
            const track = createMockTrack('Song A')

            const result = await AsyncQueueManager.playTrackSafely(queue, track)

            expect(result.success).toBe(true)
            expect(queue.addTrack).toHaveBeenCalledWith(track)
            expect(queue.node.play).not.toHaveBeenCalled()
        })

        test('handles error when addTrack throws', async () => {
            const queue = createMockQueue()
            const error = new Error('Add track error')
            queue.addTrack.mockImplementation(() => {
                throw error
            })

            const track = createMockTrack('Song A')
            const result = await AsyncQueueManager.playTrackSafely(queue, track)

            expect(result.success).toBe(false)
            expect(result.error).toBe('Add track error')
        })

        test('handles error when node.play() throws', async () => {
            const queue = createMockQueue(false)
            const error = new Error('Play error')
            queue.node.play.mockRejectedValueOnce(error)

            const track = createMockTrack('Song A')
            const result = await AsyncQueueManager.playTrackSafely(queue, track)

            expect(result.success).toBe(false)
            expect(result.error).toBe('Play error')
        })

        test('handles non-Error thrown object', async () => {
            const queue = createMockQueue()
            queue.addTrack.mockImplementation(() => {
                throw { message: 'object error' }
            })

            const track = createMockTrack('Song A')
            const result = await AsyncQueueManager.playTrackSafely(queue, track)

            expect(result.success).toBe(false)
            expect(result.error).toBe('Unknown error')
        })
    })

    describe('clearQueueSafely', () => {
        test('clears queue successfully', async () => {
            const queue = createMockQueue()

            const result = await AsyncQueueManager.clearQueueSafely(queue)

            expect(result.success).toBe(true)
            expect(result.error).toBeUndefined()
            expect(queue.tracks.clear).toHaveBeenCalled()
        })

        test('handles error when clear throws', async () => {
            const queue = createMockQueue()
            const error = new Error('Clear error')
            queue.tracks.clear.mockImplementation(() => {
                throw error
            })

            const result = await AsyncQueueManager.clearQueueSafely(queue)

            expect(result.success).toBe(false)
            expect(result.error).toBe('Clear error')
        })

        test('handles non-Error thrown object', async () => {
            const queue = createMockQueue()
            queue.tracks.clear.mockImplementation(() => {
                throw 'string error'
            })

            const result = await AsyncQueueManager.clearQueueSafely(queue)

            expect(result.success).toBe(false)
            expect(result.error).toBe('Unknown error')
        })
    })
})
