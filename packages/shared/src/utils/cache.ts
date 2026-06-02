/**
 * Bounded in-memory TTL cache. A replacement for Redis read-through caches of
 * regenerable/ephemeral data (per the Redis-removal ADRs) where the source of
 * truth is an external API rather than Postgres — e.g. the user's Discord guild
 * list or artist suggestions. Entries expire after a TTL and the cache is
 * size-capped, evicting the least-recently-written key when over capacity.
 *
 * This is deliberately NOT a strict LRU: recency is refreshed on write only, not
 * on read, which is enough for short-TTL caches and keeps the implementation a
 * plain Map. Not safe to share across processes — single-instance only (revisit
 * if Lucky scales horizontally, per the Redis-removal ADRs).
 */

interface TtlEntry<V> {
    value: V
    expiresAt: number
}

export class TtlCache<V> {
    private readonly store = new Map<string, TtlEntry<V>>()
    private readonly ttlMs: number
    private readonly maxEntries: number

    constructor(options: { ttlMs: number; maxEntries: number }) {
        this.ttlMs = options.ttlMs
        this.maxEntries = options.maxEntries
    }

    /** Returns the cached value, or `undefined` if absent or expired. */
    get(key: string): V | undefined {
        const entry = this.store.get(key)
        if (entry === undefined) {
            return undefined
        }

        if (Date.now() > entry.expiresAt) {
            this.store.delete(key)
            return undefined
        }

        return entry.value
    }

    set(key: string, value: V): void {
        // Delete-then-set moves the key to the end of insertion order, so the
        // oldest-written key is always first for eviction.
        this.store.delete(key)
        this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs })

        while (this.store.size > this.maxEntries) {
            const oldest = this.store.keys().next().value
            if (oldest === undefined) {
                break
            }
            this.store.delete(oldest)
        }
    }

    delete(key: string): void {
        this.store.delete(key)
    }

    clear(): void {
        this.store.clear()
    }

    get size(): number {
        return this.store.size
    }
}
