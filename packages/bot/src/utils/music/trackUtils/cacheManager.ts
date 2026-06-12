import { LRUCache } from 'lru-cache'
import type { TrackCacheKey, TrackInfo, TrackCacheOptions } from './types'

/**
 * Track cache manager
 */
export class TrackCacheManager {
    private readonly cache: LRUCache<string, TrackInfo>
    private readonly options: TrackCacheOptions

    constructor(options: TrackCacheOptions = { maxSize: 1000, ttl: 300000 }) {
        this.options = options
        this.cache = new LRUCache({ max: options.maxSize, ttl: options.ttl })
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
        return this.cache.size
    }

    getOptions(): TrackCacheOptions {
        return this.options
    }

    private buildCacheKey(key: TrackCacheKey): string {
        return `${key.id}:${key.title}:${key.duration}:${key.requesterId ?? 'unknown'}`
    }
}
