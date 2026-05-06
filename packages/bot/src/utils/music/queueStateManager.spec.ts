import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { GuildQueue, Track } from 'discord-player'

const debugLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
}))

import {
    getQueueState,
    isQueueEmpty,
    isQueueFull,
    getQueueStats,
    getNextTrack,
    getTrackAtPosition,
    isTrackInQueue,
    getTrackPosition,
} from './queueStateManager'

describe('queueStateManager', () => {
    let mockQueue: Partial<GuildQueue>
    let mockTrack: Partial<Track>
    let mockTrack2: Partial<Track>
    let mockTrack3: Partial<Track>

    beforeEach(() => {
        jest.clearAllMocks()

        mockTrack = {
            id: 'track-1',
            url: 'https://example.com/track1.mp3',
            author: 'Artist One',
            duration: 180000,
        }

        mockTrack2 = {
            id: 'track-2',
            url: 'https://example.com/track2.mp3',
            author: 'Artist Two',
            duration: 240000,
        }

        mockTrack3 = {
            id: 'track-3',
            url: 'https://example.com/track3.mp3',
            author: 'Artist One',
            duration: 200000,
        }

        mockQueue = {
            currentTrack: mockTrack,
            node: {
                isPlaying: jest.fn().mockReturnValue(true),
                isPaused: jest.fn().mockReturnValue(false),
                volume: 80,
                getTimestamp: jest.fn().mockReturnValue({
                    current: 30000,
                }),
            },
            tracks: {
                size: 2,
                toArray: jest.fn().mockReturnValue([mockTrack2, mockTrack3]),
            },
            repeatMode: {
                toString: jest.fn().mockReturnValue('OFF'),
            },
        } as unknown as GuildQueue
    })

    describe('getQueueState', () => {
        it('should return current queue state with all properties', () => {
            const state = getQueueState(mockQueue)

            expect(state).toEqual({
                isPlaying: true,
                isPaused: false,
                currentTrack: mockTrack,
                queueSize: 2,
                repeatMode: 'OFF',
                volume: 80,
                position: 30000,
                duration: 180000,
            })
        })

        it('should return undefined currentTrack when no current track exists', () => {
            mockQueue.currentTrack = null
            const state = getQueueState(mockQueue)

            expect(state.currentTrack).toBeUndefined()
            expect(state.isPlaying).toBe(true)
        })

        it('should handle string duration by parsing to number', () => {
            mockQueue.currentTrack = {
                ...mockTrack,
                duration: '180000',
            } as unknown as Track

            const state = getQueueState(mockQueue)

            expect(state.duration).toBe(180000)
        })

        it('should handle numeric duration without conversion', () => {
            mockQueue.currentTrack = {
                ...mockTrack,
                duration: 180000,
            } as unknown as Track

            const state = getQueueState(mockQueue)

            expect(state.duration).toBe(180000)
        })

        it('should default duration to 0 when track has no duration', () => {
            mockQueue.currentTrack = {
                id: 'track-1',
                author: 'Artist',
            } as unknown as Track

            const state = getQueueState(mockQueue)

            expect(state.duration).toBe(0)
        })

        it('should return 0 position when getTimestamp returns null', () => {
            ;(mockQueue.node?.getTimestamp as jest.Mock).mockReturnValue(null)

            const state = getQueueState(mockQueue)

            expect(state.position).toBe(0)
        })

        it('should return 0 position when getTimestamp().current is null', () => {
            ;(mockQueue.node?.getTimestamp as jest.Mock).mockReturnValue({
                current: null,
            })

            const state = getQueueState(mockQueue)

            expect(state.position).toBe(0)
        })

        it('should handle position as non-number value', () => {
            ;(mockQueue.node?.getTimestamp as jest.Mock).mockReturnValue({
                current: { valueOf: jest.fn().mockReturnValue('invalid') },
            })

            const state = getQueueState(mockQueue)

            expect(state.position).toBe(0)
        })

        it('should call node.isPlaying() and node.isPaused()', () => {
            getQueueState(mockQueue)

            expect(mockQueue.node?.isPlaying).toHaveBeenCalled()
            expect(mockQueue.node?.isPaused).toHaveBeenCalled()
        })

        it('should return default state when exception occurs', () => {
            ;(mockQueue.node?.isPlaying as jest.Mock).mockImplementation(() => {
                throw new Error('Queue error')
            })

            const state = getQueueState(mockQueue)

            expect(state).toEqual({
                isPlaying: false,
                isPaused: false,
                queueSize: 0,
                repeatMode: 'OFF',
                volume: 100,
                position: 0,
                duration: 0,
            })
            expect(debugLogMock).toHaveBeenCalledWith({
                message: 'Error getting queue state:',
                error: expect.any(Error),
            })
        })

        it('should handle paused queue state', () => {
            ;(mockQueue.node?.isPlaying as jest.Mock).mockReturnValue(false)
            ;(mockQueue.node?.isPaused as jest.Mock).mockReturnValue(true)

            const state = getQueueState(mockQueue)

            expect(state.isPlaying).toBe(false)
            expect(state.isPaused).toBe(true)
        })

        it('should convert repeatMode to string', () => {
            ;(mockQueue.repeatMode?.toString as jest.Mock).mockReturnValue(
                'QUEUE',
            )

            const state = getQueueState(mockQueue)

            expect(state.repeatMode).toBe('QUEUE')
        })
    })

    describe('isQueueEmpty', () => {
        it('should return true when queue has no tracks', () => {
            mockQueue.tracks = { size: 0 } as unknown as any

            const isEmpty = isQueueEmpty(mockQueue)

            expect(isEmpty).toBe(true)
        })

        it('should return false when queue has tracks', () => {
            mockQueue.tracks = { size: 2 } as unknown as any

            const isEmpty = isQueueEmpty(mockQueue)

            expect(isEmpty).toBe(false)
        })

        it('should return false when queue has exactly 1 track', () => {
            mockQueue.tracks = { size: 1 } as unknown as any

            const isEmpty = isQueueEmpty(mockQueue)

            expect(isEmpty).toBe(false)
        })

        it('should return true when queue size is explicitly 0', () => {
            mockQueue.tracks!.size = 0

            const isEmpty = isQueueEmpty(mockQueue)

            expect(isEmpty).toBe(true)
        })
    })

    describe('isQueueFull', () => {
        it('should return false when queue size is below max', () => {
            mockQueue.tracks!.size = 50
            const isFull = isQueueFull(mockQueue, 100)

            expect(isFull).toBe(false)
        })

        it('should return true when queue size equals max', () => {
            mockQueue.tracks!.size = 100
            const isFull = isQueueFull(mockQueue, 100)

            expect(isFull).toBe(true)
        })

        it('should return true when queue size exceeds max', () => {
            mockQueue.tracks!.size = 150
            const isFull = isQueueFull(mockQueue, 100)

            expect(isFull).toBe(true)
        })

        it('should use default max size of 100 when not provided', () => {
            mockQueue.tracks!.size = 100
            const isFull = isQueueFull(mockQueue)

            expect(isFull).toBe(true)
        })

        it('should return false with default max when queue size is 99', () => {
            mockQueue.tracks!.size = 99
            const isFull = isQueueFull(mockQueue)

            expect(isFull).toBe(false)
        })

        it('should work with custom max size', () => {
            mockQueue.tracks!.size = 25
            const isFull = isQueueFull(mockQueue, 20)

            expect(isFull).toBe(true)
        })

        it('should work with small max size', () => {
            mockQueue.tracks!.size = 1
            const isFull = isQueueFull(mockQueue, 1)

            expect(isFull).toBe(true)
        })
    })

    describe('getQueueStats', () => {
        it('should calculate total tracks and duration', () => {
            ;(mockQueue.tracks?.toArray as jest.Mock).mockReturnValue([
                { duration: 180000, author: 'Artist One' },
                { duration: 240000, author: 'Artist Two' },
                { duration: 200000, author: 'Artist One' },
            ])

            const stats = getQueueStats(mockQueue)

            expect(stats.totalTracks).toBe(3)
            expect(stats.totalDuration).toBe(620000)
        })

        it('should calculate average duration', () => {
            ;(mockQueue.tracks?.toArray as jest.Mock).mockReturnValue([
                { duration: 200000, author: 'Artist' },
                { duration: 200000, author: 'Artist' },
                { duration: 200000, author: 'Artist' },
            ])

            const stats = getQueueStats(mockQueue)

            expect(stats.averageDuration).toBe(200000)
        })

        it('should handle string durations', () => {
            ;(mockQueue.tracks?.toArray as jest.Mock).mockReturnValue([
                { duration: '180000', author: 'Artist One' },
                { duration: 240000, author: 'Artist Two' },
            ])

            const stats = getQueueStats(mockQueue)

            expect(stats.totalDuration).toBe(420000)
        })

        it('should extract unique artists', () => {
            ;(mockQueue.tracks?.toArray as jest.Mock).mockReturnValue([
                { duration: 200000, author: 'Artist One' },
                { duration: 200000, author: 'Artist Two' },
                { duration: 200000, author: 'Artist One' },
            ])

            const stats = getQueueStats(mockQueue)

            expect(stats.artists).toContain('Artist One')
            expect(stats.artists).toContain('Artist Two')
            expect(stats.artists.length).toBe(2)
        })

        it('should return empty artists array when tracks have no author', () => {
            ;(mockQueue.tracks?.toArray as jest.Mock).mockReturnValue([
                { duration: 200000 },
                { duration: 200000 },
            ])

            const stats = getQueueStats(mockQueue)

            expect(stats.artists).toEqual([])
        })

        it('should return empty genres array (not implemented)', () => {
            ;(mockQueue.tracks?.toArray as jest.Mock).mockReturnValue([
                { duration: 200000, author: 'Artist' },
            ])

            const stats = getQueueStats(mockQueue)

            expect(stats.genres).toEqual([])
        })

        it('should return 0 average duration for empty queue', () => {
            ;(mockQueue.tracks?.toArray as jest.Mock).mockReturnValue([])

            const stats = getQueueStats(mockQueue)

            expect(stats.averageDuration).toBe(0)
            expect(stats.totalTracks).toBe(0)
        })

        it('should return default stats on exception', () => {
            ;(mockQueue.tracks?.toArray as jest.Mock).mockImplementation(() => {
                throw new Error('Queue error')
            })

            const stats = getQueueStats(mockQueue)

            expect(stats).toEqual({
                totalTracks: 0,
                totalDuration: 0,
                averageDuration: 0,
                genres: [],
                artists: [],
            })
            expect(debugLogMock).toHaveBeenCalledWith({
                message: 'Error getting queue stats:',
                error: expect.any(Error),
            })
        })

        it('should handle single track', () => {
            ;(mockQueue.tracks?.toArray as jest.Mock).mockReturnValue([
                { duration: 300000, author: 'Artist' },
            ])

            const stats = getQueueStats(mockQueue)

            expect(stats.totalTracks).toBe(1)
            expect(stats.totalDuration).toBe(300000)
            expect(stats.averageDuration).toBe(300000)
        })

        it('should deduplicate artists in set', () => {
            ;(mockQueue.tracks?.toArray as jest.Mock).mockReturnValue([
                { duration: 100000, author: 'Artist A' },
                { duration: 100000, author: 'Artist A' },
                { duration: 100000, author: 'Artist A' },
            ])

            const stats = getQueueStats(mockQueue)

            expect(stats.artists).toEqual(['Artist A'])
        })
    })

    describe('getNextTrack', () => {
        it('should return first track in queue', () => {
            ;(mockQueue.tracks?.toArray as jest.Mock).mockReturnValue([
                mockTrack2,
                mockTrack3,
            ])

            const nextTrack = getNextTrack(mockQueue)

            expect(nextTrack).toBe(mockTrack2)
        })

        it('should return null when queue is empty', () => {
            ;(mockQueue.tracks?.toArray as jest.Mock).mockReturnValue([])

            const nextTrack = getNextTrack(mockQueue)

            expect(nextTrack).toBeNull()
        })

        it('should return single track when only one exists', () => {
            ;(mockQueue.tracks?.toArray as jest.Mock).mockReturnValue([
                mockTrack2,
            ])

            const nextTrack = getNextTrack(mockQueue)

            expect(nextTrack).toBe(mockTrack2)
        })

        it('should return null on exception', () => {
            ;(mockQueue.tracks?.toArray as jest.Mock).mockImplementation(() => {
                throw new Error('Queue error')
            })

            const nextTrack = getNextTrack(mockQueue)

            expect(nextTrack).toBeNull()
            expect(debugLogMock).toHaveBeenCalledWith({
                message: 'Error getting next track:',
                error: expect.any(Error),
            })
        })
    })

    describe('getTrackAtPosition', () => {
        beforeEach(() => {
            ;(mockQueue.tracks?.toArray as jest.Mock).mockReturnValue([
                mockTrack,
                mockTrack2,
                mockTrack3,
            ])
        })

        it('should return track at valid position', () => {
            const track = getTrackAtPosition(mockQueue, 0)

            expect(track).toBe(mockTrack)
        })

        it('should return track at middle position', () => {
            const track = getTrackAtPosition(mockQueue, 1)

            expect(track).toBe(mockTrack2)
        })

        it('should return track at last position', () => {
            const track = getTrackAtPosition(mockQueue, 2)

            expect(track).toBe(mockTrack3)
        })

        it('should return null when position is negative', () => {
            const track = getTrackAtPosition(mockQueue, -1)

            expect(track).toBeNull()
        })

        it('should return null when position equals queue length', () => {
            const track = getTrackAtPosition(mockQueue, 3)

            expect(track).toBeNull()
        })

        it('should return null when position exceeds queue length', () => {
            const track = getTrackAtPosition(mockQueue, 10)

            expect(track).toBeNull()
        })

        it('should return null when queue is empty', () => {
            ;(mockQueue.tracks?.toArray as jest.Mock).mockReturnValue([])

            const track = getTrackAtPosition(mockQueue, 0)

            expect(track).toBeNull()
        })

        it('should return null on exception', () => {
            ;(mockQueue.tracks?.toArray as jest.Mock).mockImplementation(() => {
                throw new Error('Queue error')
            })

            const track = getTrackAtPosition(mockQueue, 0)

            expect(track).toBeNull()
            expect(debugLogMock).toHaveBeenCalledWith({
                message: 'Error getting track at position:',
                error: expect.any(Error),
            })
        })
    })

    describe('isTrackInQueue', () => {
        beforeEach(() => {
            ;(mockQueue.tracks?.toArray as jest.Mock).mockReturnValue([
                { id: 'track-1', url: 'https://example.com/track1.mp3' },
                { id: 'track-2', url: 'https://example.com/track2.mp3' },
            ])
        })

        it('should return true when track id matches', () => {
            const inQueue = isTrackInQueue(mockQueue, 'track-1')

            expect(inQueue).toBe(true)
        })

        it('should return true when track url matches', () => {
            const inQueue = isTrackInQueue(mockQueue, 'https://example.com/track1.mp3')

            expect(inQueue).toBe(true)
        })

        it('should return false when track id does not match', () => {
            const inQueue = isTrackInQueue(mockQueue, 'track-999')

            expect(inQueue).toBe(false)
        })

        it('should return false when queue is empty', () => {
            ;(mockQueue.tracks?.toArray as jest.Mock).mockReturnValue([])

            const inQueue = isTrackInQueue(mockQueue, 'track-1')

            expect(inQueue).toBe(false)
        })

        it('should return false on exception', () => {
            ;(mockQueue.tracks?.toArray as jest.Mock).mockImplementation(() => {
                throw new Error('Queue error')
            })

            const inQueue = isTrackInQueue(mockQueue, 'track-1')

            expect(inQueue).toBe(false)
            expect(debugLogMock).toHaveBeenCalledWith({
                message: 'Error checking if track is in queue:',
                error: expect.any(Error),
            })
        })

        it('should match either id or url (id takes precedence)', () => {
            ;(mockQueue.tracks?.toArray as jest.Mock).mockReturnValue([
                { id: 'track-1', url: 'https://example.com/different.mp3' },
            ])

            const inQueue = isTrackInQueue(mockQueue, 'track-1')

            expect(inQueue).toBe(true)
        })

        it('should match url when id does not match', () => {
            ;(mockQueue.tracks?.toArray as jest.Mock).mockReturnValue([
                { id: 'different-id', url: 'https://example.com/track1.mp3' },
            ])

            const inQueue = isTrackInQueue(mockQueue, 'https://example.com/track1.mp3')

            expect(inQueue).toBe(true)
        })
    })

    describe('getTrackPosition', () => {
        beforeEach(() => {
            ;(mockQueue.tracks?.toArray as jest.Mock).mockReturnValue([
                { id: 'track-1', url: 'https://example.com/track1.mp3' },
                { id: 'track-2', url: 'https://example.com/track2.mp3' },
                { id: 'track-3', url: 'https://example.com/track3.mp3' },
            ])
        })

        it('should return position of track by id', () => {
            const position = getTrackPosition(mockQueue, 'track-2')

            expect(position).toBe(1)
        })

        it('should return position of track by url', () => {
            const position = getTrackPosition(mockQueue, 'https://example.com/track2.mp3')

            expect(position).toBe(1)
        })

        it('should return 0 for first track', () => {
            const position = getTrackPosition(mockQueue, 'track-1')

            expect(position).toBe(0)
        })

        it('should return correct position for last track', () => {
            const position = getTrackPosition(mockQueue, 'track-3')

            expect(position).toBe(2)
        })

        it('should return -1 when track not found', () => {
            const position = getTrackPosition(mockQueue, 'track-999')

            expect(position).toBe(-1)
        })

        it('should return -1 for empty queue', () => {
            ;(mockQueue.tracks?.toArray as jest.Mock).mockReturnValue([])

            const position = getTrackPosition(mockQueue, 'track-1')

            expect(position).toBe(-1)
        })

        it('should return -1 on exception', () => {
            ;(mockQueue.tracks?.toArray as jest.Mock).mockImplementation(() => {
                throw new Error('Queue error')
            })

            const position = getTrackPosition(mockQueue, 'track-1')

            expect(position).toBe(-1)
            expect(debugLogMock).toHaveBeenCalledWith({
                message: 'Error getting track position:',
                error: expect.any(Error),
            })
        })

        it('should match id before url in same track', () => {
            ;(mockQueue.tracks?.toArray as jest.Mock).mockReturnValue([
                { id: 'track-1', url: 'https://example.com/track1.mp3' },
                { id: 'track-2', url: 'https://example.com/different.mp3' },
            ])

            const position = getTrackPosition(mockQueue, 'track-2')

            expect(position).toBe(1)
        })
    })
})
