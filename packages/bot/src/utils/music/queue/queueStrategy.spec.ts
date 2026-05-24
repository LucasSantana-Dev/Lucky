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
        test.each([
            { strategy: undefined, expectedMethod: 'addTrack' as const, willError: false },
            { strategy: 'FIFO' as const, expectedMethod: 'addTrack' as const, willError: true },
            { strategy: 'LIFO' as const, expectedMethod: 'insertTrack' as const, willError: true },
        ])(
            'adds track using $strategy strategy or throws on error',
            ({ strategy, expectedMethod, willError }) => {
                const queue = createMockQueue()
                const track = createMockTrack('Song A')

                if (willError) {
                    const setupError = (q: any) => {
                        if (expectedMethod === 'addTrack') {
                            q.addTrack.mockImplementation(() => {
                                throw new Error('Operation error')
                            })
                        } else {
                            q.insertTrack.mockImplementation(() => {
                                throw new Error('Operation error')
                            })
                        }
                    }
                    setupError(queue)
                    expect(() => {
                        QueueStrategyManager.addTrackWithStrategy(queue, track, strategy as any)
                    }).toThrow('Operation error')
                } else {
                    QueueStrategyManager.addTrackWithStrategy(queue, track, strategy as any)
                    if (expectedMethod === 'addTrack') {
                        expect(queue.addTrack).toHaveBeenCalledWith(track)
                        expect(queue.insertTrack).not.toHaveBeenCalled()
                    } else {
                        expect(queue.insertTrack).toHaveBeenCalledWith(track, 0)
                        expect(queue.addTrack).not.toHaveBeenCalled()
                    }
                }
            },
        )
    })

    describe('addTracksWithStrategy', () => {
        test.each([
            { strategy: 'FIFO' as const, expectedMethod: 'addTrack' as const },
            { strategy: 'LIFO' as const, expectedMethod: 'insertTrack' as const },
        ])(
            'adds multiple tracks using $strategy strategy or handles edge cases',
            ({ strategy, expectedMethod }) => {
                const queue = createMockQueue()
                const tracks = [
                    createMockTrack('Song A', 'a'),
                    createMockTrack('Song B', 'b'),
                ]

                QueueStrategyManager.addTracksWithStrategy(queue, tracks, strategy as any)
                expect(queue[expectedMethod]).toHaveBeenCalledTimes(2)

                // Empty list
                const queue2 = createMockQueue()
                QueueStrategyManager.addTracksWithStrategy(queue2, [], strategy as any)
                expect(queue2[expectedMethod]).not.toHaveBeenCalled()

                // Error handling
                const queue3 = createMockQueue()
                queue3[expectedMethod].mockImplementation(() => {
                    throw new Error('Operation failed')
                })
                expect(() => {
                    QueueStrategyManager.addTracksWithStrategy(queue3, [tracks[0]], strategy as any)
                }).toThrow('Operation failed')
            },
        )
    })

    describe('getNextTrack', () => {
        test.each([
            { strategy: 'FIFO' as const, expectIndex: 0 },
            { strategy: 'LIFO' as const, expectIndex: -1 },
            { strategy: undefined, expectIndex: 0 },
        ])(
            'returns track using $strategy strategy',
            ({ strategy, expectIndex }) => {
                const track = createMockTrack('Song A', 'a')
                const queue = createMockQueue()
                queue.tracks.size = 1
                queue.tracks.at.mockReturnValue(track)

                const result = QueueStrategyManager.getNextTrack(queue, strategy as any)

                expect(result).toBe(track)
                expect(queue.tracks.at).toHaveBeenCalledWith(expectIndex)
            },
        )

        test('returns null for empty queue, undefined, or on error', () => {
            // Empty queue
            const queue = createMockQueue()
            queue.tracks.size = 0
            let result = QueueStrategyManager.getNextTrack(queue, 'FIFO')
            expect(result).toBeNull()
            expect(queue.tracks.at).not.toHaveBeenCalled()

            // Undefined return
            const queue2 = createMockQueue()
            queue2.tracks.size = 1
            queue2.tracks.at.mockReturnValue(undefined)
            result = QueueStrategyManager.getNextTrack(queue2, 'FIFO')
            expect(result).toBeNull()

            // Error
            const queue3 = createMockQueue()
            queue3.tracks.size = 1
            queue3.tracks.at.mockImplementation(() => {
                throw new Error('Access error')
            })
            result = QueueStrategyManager.getNextTrack(queue3, 'FIFO')
            expect(result).toBeNull()
        })
    })

    describe('removeTrackWithStrategy', () => {
        test.each([
            { strategy: 'FIFO' as const, queueSize: 1, expectIndex: 0 },
            { strategy: 'LIFO' as const, queueSize: 3, expectIndex: 2 },
            { strategy: undefined, queueSize: 1, expectIndex: 0 },
        ])(
            'removes track using $strategy strategy',
            ({ strategy, queueSize, expectIndex }) => {
                const track = createMockTrack('Song A', 'a')
                const queue = createMockQueue()
                queue.tracks.size = queueSize
                queue.tracks.at.mockReturnValue(track)

                const result = QueueStrategyManager.removeTrackWithStrategy(
                    queue,
                    strategy as any,
                )

                expect(result).toBe(track)
                expect(queue.tracks.at).toHaveBeenCalledWith(expectIndex)
                expect(queue.removeTrack).toHaveBeenCalledWith(expectIndex)
            },
        )

        test('returns null for empty queue, null at position, or on error', () => {
            // Empty queue
            const queue = createMockQueue()
            queue.tracks.size = 0
            let result = QueueStrategyManager.removeTrackWithStrategy(queue, 'FIFO')
            expect(result).toBeNull()
            expect(queue.removeTrack).not.toHaveBeenCalled()

            // Null at position
            const queue2 = createMockQueue()
            queue2.tracks.size = 1
            queue2.tracks.at.mockReturnValue(null)
            result = QueueStrategyManager.removeTrackWithStrategy(queue2, 'FIFO')
            expect(result).toBeNull()
            expect(queue2.removeTrack).not.toHaveBeenCalled()

            // Error
            const queue3 = createMockQueue()
            queue3.tracks.size = 1
            queue3.tracks.at.mockImplementation(() => {
                throw new Error('Access error')
            })
            result = QueueStrategyManager.removeTrackWithStrategy(queue3, 'FIFO')
            expect(result).toBeNull()
            expect(queue3.removeTrack).not.toHaveBeenCalled()
        })
    })
})
