import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import { QueueStrategyManager } from './queueStrategy'

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
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

function createMockQueue() {
    return {
        insertTrack: jest.fn(),
        addTrack: jest.fn(),
        tracks: {
            size: 0,
            at: jest.fn(),
        },
        removeTrack: jest.fn(),
    }
}

describe('QueueStrategyManager', () => {
    describe('addTrackWithStrategy', () => {
        test('adds track using FIFO strategy by default', () => {
            const queue = createMockQueue()
            const track = createMockTrack('Song A')

            QueueStrategyManager.addTrackWithStrategy(queue, track)

            expect(queue.addTrack).toHaveBeenCalledWith(track)
            expect(queue.insertTrack).not.toHaveBeenCalled()
        })

        test('adds track using FIFO strategy explicitly', () => {
            const queue = createMockQueue()
            const track = createMockTrack('Song A')

            QueueStrategyManager.addTrackWithStrategy(queue, track, 'FIFO')

            expect(queue.addTrack).toHaveBeenCalledWith(track)
            expect(queue.insertTrack).not.toHaveBeenCalled()
        })

        test('adds track using LIFO strategy (insert at position 0)', () => {
            const queue = createMockQueue()
            const track = createMockTrack('Song A')

            QueueStrategyManager.addTrackWithStrategy(queue, track, 'LIFO')

            expect(queue.insertTrack).toHaveBeenCalledWith(track, 0)
            expect(queue.addTrack).not.toHaveBeenCalled()
        })

        test('throws error when addTrack fails', () => {
            const queue = createMockQueue()
            const error = new Error('Add error')
            queue.addTrack.mockImplementation(() => {
                throw error
            })

            const track = createMockTrack('Song A')

            expect(() => {
                QueueStrategyManager.addTrackWithStrategy(queue, track, 'FIFO')
            }).toThrow('Add error')
        })

        test('throws error when insertTrack fails', () => {
            const queue = createMockQueue()
            const error = new Error('Insert error')
            queue.insertTrack.mockImplementation(() => {
                throw error
            })

            const track = createMockTrack('Song A')

            expect(() => {
                QueueStrategyManager.addTrackWithStrategy(queue, track, 'LIFO')
            }).toThrow('Insert error')
        })
    })

    describe('addTracksWithStrategy', () => {
        test('adds multiple tracks using FIFO strategy', () => {
            const queue = createMockQueue()
            const tracks = [
                createMockTrack('Song A', 'a'),
                createMockTrack('Song B', 'b'),
                createMockTrack('Song C', 'c'),
            ]

            QueueStrategyManager.addTracksWithStrategy(queue, tracks, 'FIFO')

            expect(queue.addTrack).toHaveBeenCalledTimes(3)
            expect(queue.addTrack).toHaveBeenNthCalledWith(1, tracks[0])
            expect(queue.addTrack).toHaveBeenNthCalledWith(2, tracks[1])
            expect(queue.addTrack).toHaveBeenNthCalledWith(3, tracks[2])
        })

        test('adds multiple tracks using LIFO strategy in reverse order', () => {
            const queue = createMockQueue()
            const tracks = [
                createMockTrack('Song A', 'a'),
                createMockTrack('Song B', 'b'),
                createMockTrack('Song C', 'c'),
            ]

            QueueStrategyManager.addTracksWithStrategy(queue, tracks, 'LIFO')

            expect(queue.insertTrack).toHaveBeenCalledTimes(3)
            expect(queue.insertTrack).toHaveBeenNthCalledWith(1, tracks[2], 0)
            expect(queue.insertTrack).toHaveBeenNthCalledWith(2, tracks[1], 0)
            expect(queue.insertTrack).toHaveBeenNthCalledWith(3, tracks[0], 0)
        })

        test('uses FIFO as default strategy', () => {
            const queue = createMockQueue()
            const tracks = [
                createMockTrack('Song A', 'a'),
                createMockTrack('Song B', 'b'),
            ]

            QueueStrategyManager.addTracksWithStrategy(queue, tracks)

            expect(queue.addTrack).toHaveBeenCalledTimes(2)
            expect(queue.insertTrack).not.toHaveBeenCalled()
        })

        test('handles empty track list', () => {
            const queue = createMockQueue()

            QueueStrategyManager.addTracksWithStrategy(queue, [], 'FIFO')

            expect(queue.addTrack).not.toHaveBeenCalled()
            expect(queue.insertTrack).not.toHaveBeenCalled()
        })

        test('handles single track with LIFO strategy', () => {
            const queue = createMockQueue()
            const tracks = [createMockTrack('Song A', 'a')]

            QueueStrategyManager.addTracksWithStrategy(queue, tracks, 'LIFO')

            expect(queue.insertTrack).toHaveBeenCalledWith(tracks[0], 0)
        })

        test('throws error when operation fails', () => {
            const queue = createMockQueue()
            const error = new Error('Operation failed')
            queue.addTrack.mockImplementation(() => {
                throw error
            })

            const tracks = [createMockTrack('Song A', 'a')]

            expect(() => {
                QueueStrategyManager.addTracksWithStrategy(
                    queue,
                    tracks,
                    'FIFO',
                )
            }).toThrow('Operation failed')
        })
    })

    describe('getNextTrack', () => {
        test('returns first track using FIFO strategy', () => {
            const track1 = createMockTrack('Song A', 'a')
            const track2 = createMockTrack('Song B', 'b')
            const queue = createMockQueue()
            queue.tracks.size = 2
            queue.tracks.at.mockImplementation((index: number) => {
                if (index === 0) return track1
                if (index === -1) return track2
                return null
            })

            const result = QueueStrategyManager.getNextTrack(queue, 'FIFO')

            expect(result).toBe(track1)
            expect(queue.tracks.at).toHaveBeenCalledWith(0)
        })

        test('returns last track using LIFO strategy', () => {
            const track1 = createMockTrack('Song A', 'a')
            const track2 = createMockTrack('Song B', 'b')
            const queue = createMockQueue()
            queue.tracks.size = 2
            queue.tracks.at.mockImplementation((index: number) => {
                if (index === -1) return track2
                if (index === 0) return track1
                return null
            })

            const result = QueueStrategyManager.getNextTrack(queue, 'LIFO')

            expect(result).toBe(track2)
            expect(queue.tracks.at).toHaveBeenCalledWith(-1)
        })

        test('uses FIFO as default strategy', () => {
            const track = createMockTrack('Song A', 'a')
            const queue = createMockQueue()
            queue.tracks.size = 1
            queue.tracks.at.mockReturnValue(track)

            const result = QueueStrategyManager.getNextTrack(queue)

            expect(result).toBe(track)
            expect(queue.tracks.at).toHaveBeenCalledWith(0)
        })

        test('returns null for empty queue', () => {
            const queue = createMockQueue()
            queue.tracks.size = 0

            const result = QueueStrategyManager.getNextTrack(queue, 'FIFO')

            expect(result).toBeNull()
            expect(queue.tracks.at).not.toHaveBeenCalled()
        })

        test('returns null when at() returns undefined (FIFO)', () => {
            const queue = createMockQueue()
            queue.tracks.size = 1
            queue.tracks.at.mockReturnValue(undefined)

            const result = QueueStrategyManager.getNextTrack(queue, 'FIFO')

            expect(result).toBeNull()
        })

        test('returns null when at() returns undefined (LIFO)', () => {
            const queue = createMockQueue()
            queue.tracks.size = 1
            queue.tracks.at.mockReturnValue(undefined)

            const result = QueueStrategyManager.getNextTrack(queue, 'LIFO')

            expect(result).toBeNull()
        })

        test('handles error gracefully', () => {
            const queue = createMockQueue()
            queue.tracks.size = 1
            queue.tracks.at.mockImplementation(() => {
                throw new Error('Access error')
            })

            const result = QueueStrategyManager.getNextTrack(queue, 'FIFO')

            expect(result).toBeNull()
        })
    })

    describe('removeTrackWithStrategy', () => {
        test('removes first track using FIFO strategy', () => {
            const track = createMockTrack('Song A', 'a')
            const queue = createMockQueue()
            queue.tracks.size = 1
            queue.tracks.at.mockReturnValue(track)

            const result = QueueStrategyManager.removeTrackWithStrategy(
                queue,
                'FIFO',
            )

            expect(result).toBe(track)
            expect(queue.tracks.at).toHaveBeenCalledWith(0)
            expect(queue.removeTrack).toHaveBeenCalledWith(0)
        })

        test('removes last track using LIFO strategy', () => {
            const track = createMockTrack('Song B', 'b')
            const queue = createMockQueue()
            queue.tracks.size = 3
            queue.tracks.at.mockImplementation((index: number) => {
                if (index === 2) return track
                return null
            })

            const result = QueueStrategyManager.removeTrackWithStrategy(
                queue,
                'LIFO',
            )

            expect(result).toBe(track)
            expect(queue.tracks.at).toHaveBeenCalledWith(2)
            expect(queue.removeTrack).toHaveBeenCalledWith(2)
        })

        test('uses FIFO as default strategy', () => {
            const track = createMockTrack('Song A', 'a')
            const queue = createMockQueue()
            queue.tracks.size = 1
            queue.tracks.at.mockReturnValue(track)

            const result = QueueStrategyManager.removeTrackWithStrategy(queue)

            expect(result).toBe(track)
            expect(queue.removeTrack).toHaveBeenCalledWith(0)
        })

        test('returns null for empty queue', () => {
            const queue = createMockQueue()
            queue.tracks.size = 0

            const result = QueueStrategyManager.removeTrackWithStrategy(
                queue,
                'FIFO',
            )

            expect(result).toBeNull()
            expect(queue.removeTrack).not.toHaveBeenCalled()
        })

        test('returns null when track at position is null (FIFO)', () => {
            const queue = createMockQueue()
            queue.tracks.size = 1
            queue.tracks.at.mockReturnValue(null)

            const result = QueueStrategyManager.removeTrackWithStrategy(
                queue,
                'FIFO',
            )

            expect(result).toBeNull()
            expect(queue.removeTrack).not.toHaveBeenCalled()
        })

        test('returns null when track at position is null (LIFO)', () => {
            const queue = createMockQueue()
            queue.tracks.size = 3
            queue.tracks.at.mockReturnValue(null)

            const result = QueueStrategyManager.removeTrackWithStrategy(
                queue,
                'LIFO',
            )

            expect(result).toBeNull()
            expect(queue.removeTrack).not.toHaveBeenCalled()
        })

        test('handles error gracefully', () => {
            const queue = createMockQueue()
            queue.tracks.size = 1
            queue.tracks.at.mockImplementation(() => {
                throw new Error('Access error')
            })

            const result = QueueStrategyManager.removeTrackWithStrategy(
                queue,
                'FIFO',
            )

            expect(result).toBeNull()
            expect(queue.removeTrack).not.toHaveBeenCalled()
        })

        test('removes from correct position with multiple tracks (LIFO)', () => {
            const track1 = createMockTrack('Song A', 'a')
            const track2 = createMockTrack('Song B', 'b')
            const track3 = createMockTrack('Song C', 'c')
            const queue = createMockQueue()
            queue.tracks.size = 3
            queue.tracks.at.mockImplementation((index: number) => {
                if (index === 2) return track3
                return null
            })

            QueueStrategyManager.removeTrackWithStrategy(queue, 'LIFO')

            expect(queue.removeTrack).toHaveBeenCalledWith(2)
        })
    })
})
