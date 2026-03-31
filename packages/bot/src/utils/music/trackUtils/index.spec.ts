import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import {
    TrackUtils,
    trackUtils,
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
        },
    }
}

describe('TrackUtils class', () => {
    let instance: TrackUtils

    beforeEach(() => {
        instance = new TrackUtils()
    })

    describe('getTrackInfo', () => {
        test('extracts track information', () => {
            const track = createMockTrack('Song A', 'Artist A')

            const info = instance.getTrackInfo(track)

            expect(info.title).toBe('Song A')
            expect(info.duration).toBe('3:00')
            expect(info.requester).toBe('TestUser')
            expect(info.isAutoplay).toBe(false)
        })

        test('handles missing requester', () => {
            const track = createMockTrack('Song A')
            track.requestedBy = null

            const info = instance.getTrackInfo(track)

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

            const info = instance.getTrackInfo(track)

            expect(info.isAutoplay).toBe(true)
            expect(info.recommendationReason).toBe('artist rotation')
            expect(info.recommendationFeedback).toBe('like')
            expect(info.sessionSnapshotId).toBe('snap-123')
        })
    })

    describe('getTrackCacheKey', () => {
        test('creates cache key from track', () => {
            const track = createMockTrack('Song A', 'Artist A', 'track-123')

            const key = instance.getTrackCacheKey(track)

            expect(key.id).toBe('track-123')
            expect(key.title).toBe('Song A')
            expect(key.duration).toBe('3:00')
            expect(key.requesterId).toBe('user-1')
        })

        test('handles missing requesterId', () => {
            const track = createMockTrack('Song A', 'Artist A', 'track-123')
            track.requestedBy = null

            const key = instance.getTrackCacheKey(track)

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

            const result = instance.categorizeTracks(tracks)

            expect(result.manualTracks).toHaveLength(2)
            expect(result.autoplayTracks).toHaveLength(2)
            expect(result.manualTracks[0].title).toBe('Song A')
            expect(result.autoplayTracks[0].title).toBe('Song B')
        })

        test('handles empty array', () => {
            const result = instance.categorizeTracks([])

            expect(result.manualTracks).toHaveLength(0)
            expect(result.autoplayTracks).toHaveLength(0)
        })

        test('handles all manual tracks', () => {
            const tracks = [
                createMockTrack('Song A', 'Artist A', 'a', false),
                createMockTrack('Song B', 'Artist B', 'b', false),
            ]

            const result = instance.categorizeTracks(tracks)

            expect(result.manualTracks).toHaveLength(2)
            expect(result.autoplayTracks).toHaveLength(0)
        })

        test('handles all autoplay tracks', () => {
            const tracks = [
                createMockTrack('Song A', 'Artist A', 'a', true),
                createMockTrack('Song B', 'Artist B', 'b', true),
            ]

            const result = instance.categorizeTracks(tracks)

            expect(result.manualTracks).toHaveLength(0)
            expect(result.autoplayTracks).toHaveLength(2)
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

            const result = instance.findSimilarTracks(tracks, 'A')

            expect(result.length).toBeGreaterThan(0)
        })

        test('respects limit parameter', () => {
            const { isSimilarTitle } = require('../titleComparison')
            isSimilarTitle.mockReturnValue(true)

            const tracks = Array.from({ length: 10 }, (_, i) =>
                createMockTrack(`Song ${i}`, 'Artist', `${i}`),
            )

            const result = instance.findSimilarTracks(tracks, 'Song', 3)

            expect(result.length).toBeLessThanOrEqual(3)
        })

        test('uses default limit of 5', () => {
            const { isSimilarTitle } = require('../titleComparison')
            isSimilarTitle.mockReturnValue(true)

            const tracks = Array.from({ length: 10 }, (_, i) =>
                createMockTrack(`Song ${i}`, 'Artist', `${i}`),
            )

            const result = instance.findSimilarTracks(tracks, 'Song')

            expect(result.length).toBeLessThanOrEqual(5)
        })

        test('returns empty array if no matches', () => {
            const { isSimilarTitle } = require('../titleComparison')
            isSimilarTitle.mockReturnValue(false)

            const tracks = [
                createMockTrack('Song A', 'Artist A', 'a'),
                createMockTrack('Song B', 'Artist B', 'b'),
            ]

            const result = instance.findSimilarTracks(tracks, 'NonExistent')

            expect(result).toHaveLength(0)
        })
    })

    describe('searchTracks', () => {
        test('searches by title', () => {
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

            const result = instance.searchTracks(tracks, options)

            expect(result.length).toBeGreaterThan(0)
            expect(result[0].title).toContain('Song')
        })

        test('searches by author', () => {
            const tracks = [
                createMockTrack('Song A', 'The Beatles', 'a'),
                createMockTrack('Song B', 'Pink Floyd', 'b'),
                createMockTrack('Song C', 'The Who', 'c'),
            ]

            const options: TrackSearchOptions = {
                query: 'The',
                limit: 10,
                includeAutoplay: true,
            }

            const result = instance.searchTracks(tracks, options)

            expect(result.length).toBeGreaterThan(0)
        })

        test('respects limit parameter', () => {
            const tracks = Array.from({ length: 10 }, (_, i) =>
                createMockTrack(`Song A ${i}`, 'Artist', `${i}`),
            )

            const options: TrackSearchOptions = {
                query: 'Song',
                limit: 3,
                includeAutoplay: true,
            }

            const result = instance.searchTracks(tracks, options)

            expect(result.length).toBeLessThanOrEqual(3)
        })

        test('excludes autoplay tracks when includeAutoplay is false', () => {
            const tracks = [
                createMockTrack('Song A', 'Artist A', 'a', false),
                createMockTrack('Song B', 'Artist B', 'b', true),
                createMockTrack('Song C', 'Artist C', 'c', false),
            ]

            const options: TrackSearchOptions = {
                query: 'Song',
                limit: 10,
                includeAutoplay: false,
            }

            const result = instance.searchTracks(tracks, options)

            const hasAutoplay = result.some(
                (t) => (t.metadata as { isAutoplay?: boolean })?.isAutoplay,
            )
            expect(hasAutoplay).toBe(false)
        })

        test('includes autoplay tracks when includeAutoplay is true', () => {
            const tracks = [
                createMockTrack('Song A', 'Artist A', 'a', false),
                createMockTrack('Song B', 'Artist B', 'b', true),
            ]

            const options: TrackSearchOptions = {
                query: 'Song',
                limit: 10,
                includeAutoplay: true,
            }

            const result = instance.searchTracks(tracks, options)

            expect(result.length).toBeGreaterThan(0)
        })

        test('case-insensitive search', () => {
            const tracks = [
                createMockTrack('Blues', 'Artist A', 'a'),
                createMockTrack('ROCK', 'Artist B', 'b'),
                createMockTrack('jazz', 'Artist C', 'c'),
            ]

            const options: TrackSearchOptions = {
                query: 'BLUES',
                limit: 10,
                includeAutoplay: true,
            }

            const result = instance.searchTracks(tracks, options)

            expect(result.some((t) => t.title.toLowerCase() === 'blues')).toBe(
                true,
            )
        })
    })

    describe('caching methods', () => {
        test('caches track info', () => {
            const track = createMockTrack('Song A', 'Artist A')

            instance.cacheTrackInfo(track)
            const cached = instance.getCachedTrackInfo(track)

            expect(cached).toBeDefined()
            expect(cached?.title).toBe('Song A')
        })

        test('returns undefined for uncached track', () => {
            const track = createMockTrack('Song A', 'Artist A')

            const cached = instance.getCachedTrackInfo(track)

            expect(cached).toBeUndefined()
        })

        test('clears cache', () => {
            const track = createMockTrack('Song A', 'Artist A')

            instance.cacheTrackInfo(track)
            instance.clearCache()
            const cached = instance.getCachedTrackInfo(track)

            expect(cached).toBeUndefined()
        })

        test('returns cache size', () => {
            const track1 = createMockTrack('Song A', 'Artist A', 'a')
            const track2 = createMockTrack('Song B', 'Artist B', 'b')

            instance.cacheTrackInfo(track1)
            expect(instance.getCacheSize()).toBe(1)

            instance.cacheTrackInfo(track2)
            expect(instance.getCacheSize()).toBe(2)
        })

        test('starts cache cleanup', () => {
            const { safeSetInterval } = require('@lucky/shared/utils')

            instance.startCacheCleanup()

            expect(safeSetInterval).toHaveBeenCalled()
        })
    })
})

describe('Exported singleton instance', () => {
    test('trackUtils is a TrackUtils instance', () => {
        expect(trackUtils).toBeInstanceOf(TrackUtils)
    })

    test('exported functions delegate to singleton', () => {
        const track = createMockTrack('Song A', 'Artist A')

        const info = getTrackInfo(track)

        expect(info.title).toBe('Song A')
    })

    test('getTrackCacheKey delegates to singleton', () => {
        const track = createMockTrack('Song A', 'Artist A', 'track-123')

        const key = getTrackCacheKey(track)

        expect(key.id).toBe('track-123')
    })

    test('categorizeTracks delegates to singleton', () => {
        const tracks = [
            createMockTrack('Song A', 'Artist A', 'a', false),
            createMockTrack('Song B', 'Artist B', 'b', true),
        ]

        const result = categorizeTracks(tracks)

        expect(result.manualTracks).toHaveLength(1)
        expect(result.autoplayTracks).toHaveLength(1)
    })

    test('findSimilarTracks delegates to singleton', () => {
        const { isSimilarTitle } = require('../titleComparison')
        isSimilarTitle.mockReturnValue(true)

        const tracks = [
            createMockTrack('Song A', 'Artist A', 'a'),
            createMockTrack('Song B', 'Artist B', 'b'),
        ]

        const result = findSimilarTracks(tracks, 'Song', 5)

        expect(result.length).toBeGreaterThan(0)
    })

    test('searchTracks delegates to singleton', () => {
        const tracks = [
            createMockTrack('Blues', 'Artist A', 'a'),
            createMockTrack('Rock', 'Artist B', 'b'),
        ]

        const options: TrackSearchOptions = {
            query: 'Blues',
            limit: 10,
            includeAutoplay: true,
        }

        const result = searchTracks(tracks, options)

        expect(result.length).toBeGreaterThan(0)
    })

    test('cache functions delegate to singleton', () => {
        const track = createMockTrack('Song A', 'Artist A')

        cacheTrackInfo(track)
        const cached = getCachedTrackInfo(track)

        expect(cached).toBeDefined()

        const size = getCacheSize()
        expect(size).toBeGreaterThan(0)

        clearCache()
        expect(getCacheSize()).toBe(0)
    })

    test('startCacheCleanup delegates to singleton', () => {
        const { safeSetInterval } = require('@lucky/shared/utils')

        startCacheCleanup()

        expect(safeSetInterval).toHaveBeenCalled()
    })
})
