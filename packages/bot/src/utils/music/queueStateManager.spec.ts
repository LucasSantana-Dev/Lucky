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
                getTimestamp: jest.fn().mockReturnValue({ current: 30000 }),
            },
            tracks: {
                size: 2,
                toArray: jest.fn().mockReturnValue([mockTrack2, mockTrack3]),
            },
            repeatMode: { toString: jest.fn().mockReturnValue('OFF') },
        } as unknown as GuildQueue
    })

    // Tracks lookup-style describes share this fixture; populating tracks once
    // here removes the per-describe beforeEach that just re-set toArray.
    function withTracks(tracks: unknown[]): void {
        ;(mockQueue.tracks?.toArray as jest.Mock).mockReturnValue(tracks)
    }
    function withTracksThrow(): void {
        ;(mockQueue.tracks?.toArray as jest.Mock).mockImplementation(() => {
            throw new Error('Queue error')
        })
    }

    describe('getQueueState', () => {
        it('returns the current queue state with all properties', () => {
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

        it.each([
            ['string duration', '180000', 180000],
            ['numeric duration', 180000, 180000],
            ['missing duration', undefined, 0],
            ['null currentTrack', null, undefined],
        ])('coerces %s on currentTrack', (scenario, duration, expected) => {
            if (scenario === 'null currentTrack') {
                mockQueue.currentTrack = null
                expect(getQueueState(mockQueue).currentTrack).toBeUndefined()
            } else {
                mockQueue.currentTrack = {
                    id: 'track-1',
                    author: 'Artist',
                    duration,
                } as unknown as Track
                expect(getQueueState(mockQueue).duration).toBe(expected)
            }
        })

        it.each([
            ['getTimestamp returns null', () => null],
            ['current is null', () => ({ current: null })],
            [
                'current is non-numeric',
                () => ({
                    current: { valueOf: jest.fn().mockReturnValue('invalid') },
                }),
            ],
        ])('returns position 0 when %s', (_label, factory) => {
            ;(mockQueue.node?.getTimestamp as jest.Mock).mockReturnValue(
                factory(),
            )
            expect(getQueueState(mockQueue).position).toBe(0)
        })

        it('returns the documented default state when an exception occurs and logs it', () => {
            ;(mockQueue.node?.isPlaying as jest.Mock).mockImplementation(() => {
                throw new Error('Queue error')
            })
            expect(getQueueState(mockQueue)).toEqual({
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

        it('reports paused and custom repeatMode state', () => {
            ;(mockQueue.node?.isPlaying as jest.Mock).mockReturnValue(false)
            ;(mockQueue.node?.isPaused as jest.Mock).mockReturnValue(true)
            ;(mockQueue.repeatMode?.toString as jest.Mock).mockReturnValue(
                'QUEUE',
            )
            const state = getQueueState(mockQueue)
            expect(state.isPlaying).toBe(false)
            expect(state.isPaused).toBe(true)
            expect(state.repeatMode).toBe('QUEUE')
        })
    })

    describe('isQueueEmpty', () => {
        it.each([
            [0, true],
            [1, false],
            [2, false],
        ])('size %s → %s', (size, expected) => {
            mockQueue.tracks = { size } as unknown as GuildQueue['tracks']
            expect(isQueueEmpty(mockQueue)).toBe(expected)
        })
    })

    describe('isQueueFull', () => {
        it.each([
            [50, 100, false],
            [99, undefined, false], // default max=100
            [100, 100, true],
            [100, undefined, true], // default max=100
            [150, 100, true],
            [25, 20, true],
            [1, 1, true],
        ])('size %s vs max %s → %s', (size, max, expected) => {
            mockQueue.tracks!.size = size
            const result =
                max === undefined
                    ? isQueueFull(mockQueue)
                    : isQueueFull(mockQueue, max)
            expect(result).toBe(expected)
        })
    })

    describe('getQueueStats', () => {
        it.each([
            [
                'multi-track with mixed durations',
                [
                    { duration: 180000, author: 'Artist One' },
                    { duration: 240000, author: 'Artist Two' },
                    { duration: 200000, author: 'Artist One' },
                ],
                {
                    totalTracks: 3,
                    totalDuration: 620000,
                    averageDuration: 206666.66666666666,
                },
            ],
            [
                'coerce string durations',
                [
                    { duration: '180000', author: 'Artist One' },
                    { duration: 240000, author: 'Artist Two' },
                ],
                {
                    totalTracks: 2,
                    totalDuration: 420000,
                    averageDuration: 210000,
                },
            ],
            [
                'single track',
                [{ duration: 300000, author: 'Artist' }],
                {
                    totalTracks: 1,
                    totalDuration: 300000,
                    averageDuration: 300000,
                },
            ],
            [
                'equal-duration tracks',
                [
                    { duration: 200000, author: 'Artist' },
                    { duration: 200000, author: 'Artist' },
                    { duration: 200000, author: 'Artist' },
                ],
                {
                    totalTracks: 3,
                    totalDuration: 600000,
                    averageDuration: 200000,
                },
            ],
            [
                'empty queue',
                [],
                { totalTracks: 0, totalDuration: 0, averageDuration: 0 },
            ],
        ])('%s', (_label, tracks, expected) => {
            withTracks(tracks)
            const stats = getQueueStats(mockQueue)
            if (expected.averageDuration !== 0 || tracks.length > 0) {
                expect(stats.totalTracks).toBe(expected.totalTracks)
                expect(stats.totalDuration).toBe(expected.totalDuration)
                expect(stats.averageDuration).toBeCloseTo(
                    expected.averageDuration,
                    5,
                )
            } else {
                expect(stats.averageDuration).toBe(0)
                expect(stats.totalTracks).toBe(0)
            }
        })

        it('extracts unique artists and excludes empty/missing authors', () => {
            withTracks([
                { duration: 100000, author: 'Artist A' },
                { duration: 100000, author: 'Artist B' },
                { duration: 100000, author: 'Artist A' }, // dedupe
                { duration: 100000 }, // no author → excluded
            ])
            const stats = getQueueStats(mockQueue)
            expect(stats.artists.sort()).toEqual(['Artist A', 'Artist B'])
        })

        it('returns empty genres array (genres are not implemented yet)', () => {
            withTracks([{ duration: 200000, author: 'Artist' }])
            expect(getQueueStats(mockQueue).genres).toEqual([])
        })

        it('returns the documented default stats on exception and logs it', () => {
            withTracksThrow()
            expect(getQueueStats(mockQueue)).toEqual({
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
    })

    describe('getNextTrack', () => {
        it.each([
            ['multi-track queue → first', [() => undefined], 'mockTrack2'],
            ['single-track queue → that track', null, 'mockTrack2'],
            ['empty queue → null', [], null],
        ] as const)('%s', (_label, tracks, expected) => {
            const lookup = { mockTrack2 }
            if (tracks === null) withTracks([mockTrack2])
            else if (Array.isArray(tracks) && tracks.length === 0)
                withTracks([])
            else withTracks([mockTrack2, mockTrack3])
            const next = getNextTrack(mockQueue)
            expect(next).toBe(
                expected ? lookup[expected as keyof typeof lookup] : null,
            )
        })

        it('returns null on exception and logs it', () => {
            withTracksThrow()
            expect(getNextTrack(mockQueue)).toBeNull()
            expect(debugLogMock).toHaveBeenCalledWith({
                message: 'Error getting next track:',
                error: expect.any(Error),
            })
        })
    })

    describe('getTrackAtPosition', () => {
        beforeEach(() => withTracks([mockTrack, mockTrack2, mockTrack3]))

        it.each([
            ['first', 0, 'mockTrack'],
            ['middle', 1, 'mockTrack2'],
            ['last', 2, 'mockTrack3'],
            ['negative', -1, null],
            ['exceeds length', 10, null],
        ] as const)('position %s → %s', (_label, position, expected) => {
            const lookup = { mockTrack, mockTrack2, mockTrack3 }
            const track = getTrackAtPosition(mockQueue, position)
            expect(track).toBe(
                expected ? lookup[expected as keyof typeof lookup] : null,
            )
        })

        it('returns null on exception and logs it', () => {
            withTracksThrow()
            expect(getTrackAtPosition(mockQueue, 0)).toBeNull()
            expect(debugLogMock).toHaveBeenCalledWith({
                message: 'Error getting track at position:',
                error: expect.any(Error),
            })
        })
    })

    describe('isTrackInQueue', () => {
        beforeEach(() =>
            withTracks([
                { id: 'track-1', url: 'https://example.com/track1.mp3' },
                { id: 'track-2', url: 'https://example.com/track2.mp3' },
            ]),
        )

        it.each([
            ['matching id', 'track-1', true],
            ['matching url', 'https://example.com/track1.mp3', true],
            ['no match', 'track-999', false],
        ])('%s → %s', (_label, needle, expected) => {
            expect(isTrackInQueue(mockQueue, needle)).toBe(expected)
        })

        it('falls back to url when id does not match', () => {
            withTracks([
                { id: 'different-id', url: 'https://example.com/track1.mp3' },
            ])
            expect(
                isTrackInQueue(mockQueue, 'https://example.com/track1.mp3'),
            ).toBe(true)
        })

        it('returns false on exception and logs it', () => {
            withTracksThrow()
            expect(isTrackInQueue(mockQueue, 'track-1')).toBe(false)
            expect(debugLogMock).toHaveBeenCalledWith({
                message: 'Error checking if track is in queue:',
                error: expect.any(Error),
            })
        })
    })

    describe('getTrackPosition', () => {
        beforeEach(() =>
            withTracks([
                { id: 'track-1', url: 'https://example.com/track1.mp3' },
                { id: 'track-2', url: 'https://example.com/track2.mp3' },
                { id: 'track-3', url: 'https://example.com/track3.mp3' },
            ]),
        )

        it.each([
            ['first by id', 'track-1', 0],
            ['middle by id', 'track-2', 1],
            ['last by id', 'track-3', 2],
            ['by url', 'https://example.com/track2.mp3', 1],
            ['not found', 'track-999', -1],
        ])('%s → %s', (_label, needle, expected) => {
            expect(getTrackPosition(mockQueue, needle)).toBe(expected)
        })

        it('returns -1 on exception and logs it', () => {
            withTracksThrow()
            expect(getTrackPosition(mockQueue, 'track-1')).toBe(-1)
            expect(debugLogMock).toHaveBeenCalledWith({
                message: 'Error getting track position:',
                error: expect.any(Error),
            })
        })
    })
})
