import { describe, test, expect, beforeEach } from '@jest/globals'
import { LRUCache, TrackCacheManager } from './cacheManager'
import type { TrackInfo, TrackCacheKey } from './types'

describe('LRUCache', () => {
    describe('basic operations', () => {
        test('stores and retrieves value', () => {
            const cache = new LRUCache<string, string>(10)

            cache.set('key1', 'value1')
            const result = cache.get('key1')

            expect(result).toBe('value1')
        })

        test('returns undefined for missing key', () => {
            const cache = new LRUCache<string, string>(10)

            const result = cache.get('nonexistent')

            expect(result).toBeUndefined()
        })

        test('checks key existence with has()', () => {
            const cache = new LRUCache<string, string>(10)
            cache.set('key1', 'value1')

            expect(cache.has('key1')).toBe(true)
            expect(cache.has('key2')).toBe(false)
        })

        test('deletes key', () => {
            const cache = new LRUCache<string, string>(10)
            cache.set('key1', 'value1')

            const deleted = cache.delete('key1')

            expect(deleted).toBe(true)
            expect(cache.has('key1')).toBe(false)
        })

        test('returns false when deleting non-existent key', () => {
            const cache = new LRUCache<string, string>(10)

            const deleted = cache.delete('nonexistent')

            expect(deleted).toBe(false)
        })

        test('clears all entries', () => {
            const cache = new LRUCache<string, string>(10)
            cache.set('key1', 'value1')
            cache.set('key2', 'value2')

            cache.clear()

            expect(cache.size()).toBe(0)
            expect(cache.has('key1')).toBe(false)
        })

        test('returns correct size', () => {
            const cache = new LRUCache<string, string>(10)

            expect(cache.size()).toBe(0)

            cache.set('key1', 'value1')
            expect(cache.size()).toBe(1)

            cache.set('key2', 'value2')
            expect(cache.size()).toBe(2)
        })
    })

    describe('LRU eviction', () => {
        test('evicts least recently used item when capacity exceeded', () => {
            const cache = new LRUCache<string, string>(2)
            cache.set('key1', 'value1')
            cache.set('key2', 'value2')

            cache.set('key3', 'value3')

            expect(cache.has('key1')).toBe(false)
            expect(cache.has('key2')).toBe(true)
            expect(cache.has('key3')).toBe(true)
            expect(cache.size()).toBe(2)
        })

        test('moves accessed item to end (most recently used)', () => {
            const cache = new LRUCache<string, string>(3)
            cache.set('key1', 'value1')
            cache.set('key2', 'value2')
            cache.set('key3', 'value3')

            cache.get('key1')
            cache.set('key4', 'value4')

            expect(cache.has('key2')).toBe(false)
            expect(cache.has('key1')).toBe(true)
        })

        test('updates existing key without eviction', () => {
            const cache = new LRUCache<string, string>(2)
            cache.set('key1', 'value1')
            cache.set('key2', 'value2')

            cache.set('key1', 'updated')

            expect(cache.get('key1')).toBe('updated')
            expect(cache.size()).toBe(2)
            expect(cache.has('key2')).toBe(true)
        })

        test('handles numeric keys', () => {
            const cache = new LRUCache<number, string>(3)
            cache.set(1, 'one')
            cache.set(2, 'two')
            cache.set(3, 'three')
            cache.set(4, 'four')

            expect(cache.has(1)).toBe(false)
            expect(cache.has(2)).toBe(true)
            expect(cache.get(3)).toBe('three')
        })

        test('handles object keys', () => {
            const cache = new LRUCache<object, string>(2)
            const key1 = { id: '1' }
            const key2 = { id: '2' }
            const key3 = { id: '3' }

            cache.set(key1, 'value1')
            cache.set(key2, 'value2')
            cache.set(key3, 'value3')

            expect(cache.has(key1)).toBe(false)
            expect(cache.has(key2)).toBe(true)
            expect(cache.get(key3)).toBe('value3')
        })

        test('capacity of 1 maintains only latest item', () => {
            const cache = new LRUCache<string, string>(1)

            cache.set('key1', 'value1')
            expect(cache.get('key1')).toBe('value1')

            cache.set('key2', 'value2')
            expect(cache.has('key1')).toBe(false)
            expect(cache.get('key2')).toBe('value2')

            cache.set('key3', 'value3')
            expect(cache.has('key2')).toBe(false)
            expect(cache.get('key3')).toBe('value3')
        })
    })

    describe('access order tracking', () => {
        test('get() marks item as recently used', () => {
            const cache = new LRUCache<string, string>(3)
            cache.set('key1', 'value1')
            cache.set('key2', 'value2')
            cache.set('key3', 'value3')

            cache.get('key1')
            cache.set('key4', 'value4')

            expect(cache.has('key1')).toBe(true)
            expect(cache.has('key2')).toBe(false)
        })

        test('multiple gets maintain order', () => {
            const cache = new LRUCache<string, string>(3)
            cache.set('key1', 'value1')
            cache.set('key2', 'value2')
            cache.set('key3', 'value3')

            cache.get('key1')
            cache.get('key2')
            cache.set('key4', 'value4')

            expect(cache.has('key3')).toBe(false)
            expect(cache.has('key1')).toBe(true)
            expect(cache.has('key2')).toBe(true)
        })
    })
})

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

        test('checks key existence with has()', () => {
            const manager = new TrackCacheManager()
            const key = createCacheKey('track-1', 'Song A')
            const info = createTrackInfo('Song A')

            manager.set(key, info)

            expect(manager.has(key)).toBe(true)
        })

        test('returns false for non-existent keys', () => {
            const manager = new TrackCacheManager()
            const key = createCacheKey('nonexistent', 'Unknown')

            expect(manager.has(key)).toBe(false)
        })

        test('deletes track info', () => {
            const manager = new TrackCacheManager()
            const key = createCacheKey('track-1', 'Song A')
            const info = createTrackInfo('Song A')

            manager.set(key, info)
            const deleted = manager.delete(key)

            expect(deleted).toBe(true)
            expect(manager.has(key)).toBe(false)
        })

        test('returns false when deleting non-existent key', () => {
            const manager = new TrackCacheManager()
            const key = createCacheKey('nonexistent', 'Unknown')

            const deleted = manager.delete(key)

            expect(deleted).toBe(false)
        })

        test('clears all cached entries', () => {
            const manager = new TrackCacheManager()
            const key1 = createCacheKey('track-1', 'Song A')
            const key2 = createCacheKey('track-2', 'Song B')

            manager.set(key1, createTrackInfo('Song A'))
            manager.set(key2, createTrackInfo('Song B'))

            manager.clear()

            expect(manager.size()).toBe(0)
            expect(manager.has(key1)).toBe(false)
        })

        test('returns cache size', () => {
            const manager = new TrackCacheManager()
            const key1 = createCacheKey('track-1', 'Song A')
            const key2 = createCacheKey('track-2', 'Song B')

            expect(manager.size()).toBe(0)

            manager.set(key1, createTrackInfo('Song A'))
            expect(manager.size()).toBe(1)

            manager.set(key2, createTrackInfo('Song B'))
            expect(manager.size()).toBe(2)
        })
    })

    describe('cache key building', () => {
        test('builds consistent cache key', () => {
            const manager = new TrackCacheManager()
            const key1 = createCacheKey('track-1', 'Song A')
            const key2 = createCacheKey('track-1', 'Song A')

            manager.set(key1, createTrackInfo('Song A'))
            const result = manager.get(key2)

            expect(result).toBeDefined()
        })

        test('differentiates by id', () => {
            const manager = new TrackCacheManager()
            const key1 = createCacheKey('track-1', 'Song')
            const key2 = createCacheKey('track-2', 'Song')

            manager.set(key1, createTrackInfo('Song', '3:00'))
            manager.set(key2, createTrackInfo('Song', '3:00'))

            const result1 = manager.get(key1)
            const result2 = manager.get(key2)

            expect(result1).toBeDefined()
            expect(result2).toBeDefined()
        })

        test('differentiates by title', () => {
            const manager = new TrackCacheManager()
            const key1 = createCacheKey('track-1', 'Song A')
            const key2 = createCacheKey('track-1', 'Song B')

            const info1 = createTrackInfo('Song A')
            const info2 = createTrackInfo('Song B')

            manager.set(key1, info1)
            manager.set(key2, info2)

            const result1 = manager.get(key1)
            const result2 = manager.get(key2)

            expect(result1?.title).toBe('Song A')
            expect(result2?.title).toBe('Song B')
        })

        test('includes requesterId in key when provided', () => {
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

            manager.set(key1, createTrackInfo('Song A'))
            manager.set(key2, createTrackInfo('Song A'))

            expect(manager.get(key1)).toBeDefined()
            expect(manager.get(key2)).toBeDefined()
            expect(manager.size()).toBe(2)
        })

        test('handles missing requesterId with default', () => {
            const manager = new TrackCacheManager()
            const key: TrackCacheKey = {
                id: 'track-1',
                title: 'Song A',
                duration: '3:00',
            }

            manager.set(key, createTrackInfo('Song A'))
            const result = manager.get(key)

            expect(result).toBeDefined()
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
