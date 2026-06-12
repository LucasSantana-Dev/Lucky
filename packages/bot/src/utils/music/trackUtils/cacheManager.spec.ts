import { describe, test, expect, beforeEach } from '@jest/globals'
import { TrackCacheManager } from './cacheManager'
import type { TrackInfo, TrackCacheKey } from './types'

describe('TrackCacheManager', () => {
    function createTrackInfo(
        title: string,
        duration: string = '3:00',
    ): TrackInfo {
        return {
            title,
            duration,
            requester: 'TestUser',
            isAutoplay: false,
        }
    }

    function createCacheKey(id: string, title: string): TrackCacheKey {
        return {
            id,
            title,
            duration: '3:00',
        }
    }

    describe('initialization', () => {
        test('initializes with default options', () => {
            const manager = new TrackCacheManager()

            const options = manager.getOptions()

            expect(options.maxSize).toBe(1000)
            expect(options.ttl).toBe(300000)
        })

        test('initializes with custom options', () => {
            const manager = new TrackCacheManager({ maxSize: 500, ttl: 60000 })

            const options = manager.getOptions()

            expect(options.maxSize).toBe(500)
            expect(options.ttl).toBe(60000)
        })
    })

    describe('cache operations', () => {
        test('stores and retrieves track info', () => {
            const manager = new TrackCacheManager()
            const key = createCacheKey('track-1', 'Song A')
            const info = createTrackInfo('Song A')

            manager.set(key, info)
            const result = manager.get(key)

            expect(result).toEqual(info)
        })

        test('returns undefined for missing key', () => {
            const manager = new TrackCacheManager()
            const key = createCacheKey('nonexistent', 'Unknown')

            const result = manager.get(key)

            expect(result).toBeUndefined()
        })

        test('checks key existence with has() and returns false for missing', () => {
            const manager = new TrackCacheManager()
            const key = createCacheKey('track-1', 'Song A')
            const info = createTrackInfo('Song A')

            manager.set(key, info)

            expect(manager.has(key)).toBe(true)
            expect(manager.has(createCacheKey('nonexistent', 'Unknown'))).toBe(
                false,
            )
        })

        test('deletes track and returns appropriate status', () => {
            const manager = new TrackCacheManager()
            const key = createCacheKey('track-1', 'Song A')
            const info = createTrackInfo('Song A')

            manager.set(key, info)
            const deleted = manager.delete(key)

            expect(deleted).toBe(true)
            expect(manager.has(key)).toBe(false)
            expect(
                manager.delete(createCacheKey('nonexistent', 'Unknown')),
            ).toBe(false)
        })

        test('clears all cached entries and tracks size', () => {
            const manager = new TrackCacheManager()
            const key1 = createCacheKey('track-1', 'Song A')
            const key2 = createCacheKey('track-2', 'Song B')

            expect(manager.size()).toBe(0)

            manager.set(key1, createTrackInfo('Song A'))
            expect(manager.size()).toBe(1)

            manager.set(key2, createTrackInfo('Song B'))
            expect(manager.size()).toBe(2)

            manager.clear()

            expect(manager.size()).toBe(0)
            expect(manager.has(key1)).toBe(false)
        })
    })

    describe('cache key building', () => {
        test('builds consistent and differentiates keys by id and title', () => {
            const manager = new TrackCacheManager()
            const key1 = createCacheKey('track-1', 'Song A')
            const key2 = createCacheKey('track-1', 'Song A')
            const key3 = createCacheKey('track-2', 'Song A')
            const key4 = createCacheKey('track-1', 'Song B')

            manager.set(key1, createTrackInfo('Song A'))
            manager.set(key3, createTrackInfo('Song A'))
            manager.set(key4, createTrackInfo('Song B'))

            expect(manager.get(key2)).toBeDefined()
            expect(manager.get(key2)?.title).toBe('Song A')
            expect(manager.get(key3)).toBeDefined()
            expect(manager.get(key4)?.title).toBe('Song B')
        })

        test('handles requesterId in key and missing requesterId', () => {
            const manager = new TrackCacheManager()
            const key1: TrackCacheKey = {
                id: 'track-1',
                title: 'Song A',
                duration: '3:00',
                requesterId: 'user-1',
            }
            const key2: TrackCacheKey = {
                id: 'track-1',
                title: 'Song A',
                duration: '3:00',
                requesterId: 'user-2',
            }
            const key3: TrackCacheKey = {
                id: 'track-1',
                title: 'Song A',
                duration: '3:00',
            }

            manager.set(key1, createTrackInfo('Song A'))
            manager.set(key2, createTrackInfo('Song A'))
            manager.set(key3, createTrackInfo('Song A'))

            expect(manager.get(key1)).toBeDefined()
            expect(manager.get(key2)).toBeDefined()
            expect(manager.get(key3)).toBeDefined()
            expect(manager.size()).toBe(3)
        })
    })

    describe('cache capacity limits', () => {
        test('respects custom cache size limit', () => {
            const manager = new TrackCacheManager({ maxSize: 3, ttl: 300000 })

            const key1 = createCacheKey('track-1', 'Song A')
            const key2 = createCacheKey('track-2', 'Song B')
            const key3 = createCacheKey('track-3', 'Song C')
            const key4 = createCacheKey('track-4', 'Song D')

            manager.set(key1, createTrackInfo('Song A'))
            manager.set(key2, createTrackInfo('Song B'))
            manager.set(key3, createTrackInfo('Song C'))
            manager.set(key4, createTrackInfo('Song D'))

            expect(manager.size()).toBeLessThanOrEqual(3)
            expect(manager.has(key1)).toBe(false)
        })
    })

    describe('integration', () => {
        test('handles update of existing track', () => {
            const manager = new TrackCacheManager()
            const key = createCacheKey('track-1', 'Song A')
            const info1 = createTrackInfo('Song A', '3:00')
            const info2: TrackInfo = {
                ...info1,
                requester: 'UpdatedUser',
            }

            manager.set(key, info1)
            expect(manager.get(key)?.requester).toBe('TestUser')

            manager.set(key, info2)
            expect(manager.get(key)?.requester).toBe('UpdatedUser')
        })

        test('maintains separate entries for different tracks', () => {
            const manager = new TrackCacheManager()

            for (let i = 1; i <= 5; i++) {
                const key = createCacheKey(`track-${i}`, `Song ${i}`)
                const info = createTrackInfo(`Song ${i}`)
                manager.set(key, info)
            }

            expect(manager.size()).toBe(5)

            for (let i = 1; i <= 5; i++) {
                const key = createCacheKey(`track-${i}`, `Song ${i}`)
                expect(manager.has(key)).toBe(true)
            }
        })
    })
})
