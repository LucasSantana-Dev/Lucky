import type { TrackCacheKey, TrackInfo, TrackCacheOptions } from './types'

/**
 * LRU cache for track info
 */
export class LRUCache<K, V> {
    private readonly cache = new Map<K, V>()
    private readonly maxSize: number

    constructor(maxSize: number) {
        this.maxSize = maxSize
    }

    get(key: K): V | undefined {
        const value = this.cache.get(key)
        if (value !== undefined) {
            // Move to end (most recently used)
            this.cache.delete(key)
            this.cache.set(key, value)
        }
        return value
    }

    set(key: K, value: V): void {
        if (this.cache.has(key)) {
            this.cache.delete(key)
        } else if (this.cache.size >= this.maxSize) {
            // Remove least recently used (first item)
            const firstKey = this.cache.keys().next().value
            if (firstKey !== undefined) {
                this.cache.delete(firstKey)
            }
        }
        this.cache.set(key, value)
    }

    has(key: K): boolean {
        return this.cache.has(key)
    }

    delete(key: K): boolean {
        return this.cache.delete(key)
    }

    clear(): void {
        this.cache.clear()
    }

    size(): number {
        return this.cache.size
    }
}

/**
 * Track cache manager
 */
export class TrackCacheManager {
    private readonly cache: LRUCache<string, TrackInfo>
    private readonly options: TrackCacheOptions

    constructor(options: TrackCacheOptions = { maxSize: 1000, ttl: 300000 }) {
        this.options = options
        this.cache = new LRUCache(options.maxSize)
        // options is used for initialization above
    }

    get(key: TrackCacheKey): TrackInfo | undefined {
        const cacheKey = this.buildCacheKey(key)
        return this.cache.get(cacheKey)
    }

    set(key: TrackCacheKey, value: TrackInfo): void {
        const cacheKey = this.buildCacheKey(key)
        this.cache.set(cacheKey, value)
    }

    has(key: TrackCacheKey): boolean {
        const cacheKey = this.buildCacheKey(key)
        return this.cache.has(cacheKey)
    }

    delete(key: TrackCacheKey): boolean {
        const cacheKey = this.buildCacheKey(key)
        return this.cache.delete(cacheKey)
    }

    clear(): void {
        this.cache.clear()
    }

    size(): number {
        return this.cache.size()
    }

    getOptions(): TrackCacheOptions {
        return this.options
    }

    private buildCacheKey(key: TrackCacheKey): string {
        return `${key.id}:${key.title}:${key.duration}:${key.requesterId ?? 'unknown'}`
    }
}
