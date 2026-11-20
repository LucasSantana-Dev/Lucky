import {
    TrackUtils,
    getTrackInfo,
    getTrackCacheKey,
    categorizeTracks,
    findSimilarTracks,
    searchTracks,
    cacheTrackInfo,
    getCachedTrackInfo,
    clearCache,
    getCacheSize,
    startCacheCleanup,
} from './index'
import type { TrackInfo, TrackSearchOptions } from './types'

jest.mock('@lucky/shared/utils', () => ({
    safeSetInterval: jest.fn(),
    debugLog: jest.fn(),
}))

jest.mock('../titleComparison', () => ({
    isSimilarTitle: jest.fn(),
}))

function createMockTrack(
    title: string,
    author: string = 'Artist',
    id: string = title,
    isAutoplay: boolean = false,
) {
    return {
        id,
        title,
        author,
        duration: '3:00',
        source: 'youtube',
        requestedBy: {
            id: 'user-1',
            username: 'TestUser',
        },
        metadata: {
            isAutoplay,
        } as Record<string, unknown>,
    }
}

describe('standalone function exports', () => {
    beforeEach(() => {
        const { isSimilarTitle } = require('../titleComparison')
        isSimilarTitle.mockReturnValue(false)
    })

    test('delegates to trackUtils singleton', () => {
        const track = createMockTrack('Song A', 'Artist A', 'track-standalone')

        expect(getTrackInfo(track as never)).toBeDefined()
        expect(getTrackCacheKey(track as never)).toBeDefined()
        expect(categorizeTracks([track as never])).toBeDefined()
        expect(findSimilarTracks([track as never], 'query')).toEqual([])
        expect(
            searchTracks([track as never], {
                query: 'Song',
                limit: 10,
                includeAutoplay: true,
            }),
        ).toBeDefined()
        cacheTrackInfo(track as never)
        expect(getCachedTrackInfo(track as never)).toBeDefined()
        clearCache()
        expect(getCacheSize()).toBe(0)
        startCacheCleanup()
    })
})

describe('TrackUtils class', () => {
    let instance: TrackUtils

    beforeEach(() => {
        instance = new TrackUtils()
    })

    describe('getTrackInfo', () => {
        test('extracts track information', () => {
            const track = createMockTrack('Song A', 'Artist A')

            const info = instance.getTrackInfo(track as never)

            expect(info.title).toBe('Song A')
            expect(info.duration).toBe('3:00')
            expect(info.requester).toBe('TestUser')
            expect(info.isAutoplay).toBe(false)
        })

        test('handles missing requester', () => {
            const track = createMockTrack('Song A')
            track.requestedBy = null as never

            const info = instance.getTrackInfo(track as never)

            expect(info.requester).toBe('Unknown')
        })

        test('includes metadata fields', () => {
            const track = createMockTrack('Song A')
            track.metadata = {
                isAutoplay: true,
                recommendationReason: 'artist rotation',
                recommendationFeedback: 'like',
                sessionSnapshotId: 'snap-123',
            }

            const info = instance.getTrackInfo(track as never)

            expect(info.isAutoplay).toBe(true)
            expect(info.recommendationReason).toBe('artist rotation')
            expect(info.recommendationFeedback).toBe('like')
            expect(info.sessionSnapshotId).toBe('snap-123')
        })
    })

    describe('getTrackCacheKey', () => {
        test('creates cache key from track', () => {
            const track = createMockTrack('Song A', 'Artist A', 'track-123')

            const key = instance.getTrackCacheKey(track as never)

            expect(key.id).toBe('track-123')
            expect(key.title).toBe('Song A')
            expect(key.duration).toBe('3:00')
            expect(key.requesterId).toBe('user-1')
        })

        test('handles missing requesterId', () => {
            const track = createMockTrack('Song A', 'Artist A', 'track-123')
            track.requestedBy = null as never

            const key = instance.getTrackCacheKey(track as never)

            expect(key.requesterId).toBeUndefined()
        })
    })

    describe('categorizeTracks', () => {
        test('separates manual and autoplay tracks', () => {
            const tracks = [
                createMockTrack('Song A', 'Artist A', 'a', false),
                createMockTrack('Song B', 'Artist B', 'b', true),
                createMockTrack('Song C', 'Artist C', 'c', false),
                createMockTrack('Song D', 'Artist D', 'd', true),
            ]

            const result = instance.categorizeTracks(tracks as never)

            expect(result.manualTracks).toHaveLength(2)
            expect(result.autoplayTracks).toHaveLength(2)
        })

        test('handles empty and homogeneous arrays', () => {
            const emptyResult = instance.categorizeTracks([])
            expect(emptyResult.manualTracks).toHaveLength(0)
            expect(emptyResult.autoplayTracks).toHaveLength(0)

            const allManual = instance.categorizeTracks([
                createMockTrack('Song A', 'Artist A', 'a', false) as never,
                createMockTrack('Song B', 'Artist B', 'b', false) as never,
            ])
            expect(allManual.manualTracks).toHaveLength(2)
            expect(allManual.autoplayTracks).toHaveLength(0)
        })
    })

    describe('findSimilarTracks', () => {
        test('finds tracks with similar titles', () => {
            const { isSimilarTitle } = require('../titleComparison')
            isSimilarTitle.mockImplementation(
                (title: string, query: string) => {
                    return title.toLowerCase().includes(query.toLowerCase())
                },
            )

            const tracks = [
                createMockTrack('Song A', 'Artist A', 'a'),
                createMockTrack('Song AA', 'Artist B', 'b'),
                createMockTrack('Other Song', 'Artist C', 'c'),
            ]

            const result = instance.findSimilarTracks(tracks as never, 'A')

            expect(result.length).toBeGreaterThan(0)
        })

        test('respects limit parameter', () => {
            const { isSimilarTitle } = require('../titleComparison')
            isSimilarTitle.mockReturnValue(true)

            const tracks = Array.from({ length: 10 }, (_, i) =>
                createMockTrack(`Song ${i}`, 'Artist', `${i}`),
            )

            const result = instance.findSimilarTracks(
                tracks as never,
                'Song',
                3,
            )

            expect(result.length).toBeLessThanOrEqual(3)
        })

        test('uses default limit of 5', () => {
            const { isSimilarTitle } = require('../titleComparison')
            isSimilarTitle.mockReturnValue(true)

            const tracks = Array.from({ length: 10 }, (_, i) =>
                createMockTrack(`Song ${i}`, 'Artist', `${i}`),
            )

            const result = instance.findSimilarTracks(tracks as never, 'Song')

            expect(result.length).toBeLessThanOrEqual(5)
        })

        test('returns empty array if no matches', () => {
            const { isSimilarTitle } = require('../titleComparison')
            isSimilarTitle.mockReturnValue(false)

            const tracks = [
                createMockTrack('Song A', 'Artist A', 'a'),
                createMockTrack('Song B', 'Artist B', 'b'),
            ]

            const result = instance.findSimilarTracks(
                tracks as never,
                'NonExistent',
            )

            expect(result).toHaveLength(0)
        })
    })

    describe('searchTracks', () => {
        test('searches by title and author', () => {
            const tracks = [
                createMockTrack('Blues Song', 'Artist A', 'a'),
                createMockTrack('Rock Song', 'Artist B', 'b'),
                createMockTrack('Jazz', 'Artist C', 'c'),
            ]

            const options: TrackSearchOptions = {
                query: 'Song',
                limit: 10,
                includeAutoplay: true,
            }

            const result = instance.searchTracks(tracks as never, options)
            expect(result.length).toBeGreaterThan(0)
            expect(result.some((t) => t.title.includes('Song'))).toBe(true)
        })

        test('respects limit and autoplay filter', () => {
            const tracks = Array.from({ length: 10 }, (_, i) =>
                createMockTrack(`Song A ${i}`, 'Artist', `${i}`, i % 2 === 0),
            )

            const limitResult = instance.searchTracks(tracks as never, {
                query: 'Song',
                limit: 3,
                includeAutoplay: true,
            })
            expect(limitResult.length).toBeLessThanOrEqual(3)

            const excludeAutoplayResult = instance.searchTracks(
                tracks as never,
                {
                    query: 'Song',
                    limit: 10,
                    includeAutoplay: false,
                },
            )
            const hasAutoplay = excludeAutoplayResult.some(
                (t) => (t.metadata as { isAutoplay?: boolean })?.isAutoplay,
            )
            expect(hasAutoplay).toBe(false)
        })

        test('case-insensitive search', () => {
            const tracks = [
                createMockTrack('Blues', 'Artist A', 'a'),
                createMockTrack('ROCK', 'Artist B', 'b'),
            ]

            const result = instance.searchTracks(tracks as never, {
                query: 'BLUES',
                limit: 10,
                includeAutoplay: true,
            })

            expect(result.some((t) => t.title.toLowerCase() === 'blues')).toBe(
                true,
            )
        })
    })

    describe('caching methods', () => {
        test('caches track info', () => {
            const track = createMockTrack('Song A', 'Artist A')

            instance.cacheTrackInfo(track as never)
            const cached = instance.getCachedTrackInfo(track as never)

            expect(cached).toBeDefined()
            expect(cached?.title).toBe('Song A')
        })

        test('returns undefined for uncached track', () => {
            const track = createMockTrack('Song A', 'Artist A')

            const cached = instance.getCachedTrackInfo(track as never)

            expect(cached).toBeUndefined()
        })

        test('clears cache', () => {
            const track = createMockTrack('Song A', 'Artist A')

            instance.cacheTrackInfo(track as never)
            instance.clearCache()
            const cached = instance.getCachedTrackInfo(track as never)

            expect(cached).toBeUndefined()
        })

        test('returns cache size', () => {
            const track1 = createMockTrack('Song A', 'Artist A', 'a')
            const track2 = createMockTrack('Song B', 'Artist B', 'b')

            instance.cacheTrackInfo(track1 as never)
            expect(instance.getCacheSize()).toBe(1)

            instance.cacheTrackInfo(track2 as never)
            expect(instance.getCacheSize()).toBe(2)
        })

        test('starts cache cleanup', () => {
            const { safeSetInterval } = require('@lucky/shared/utils')

            instance.startCacheCleanup()

            expect(safeSetInterval).toHaveBeenCalled()
        })
    })
})
