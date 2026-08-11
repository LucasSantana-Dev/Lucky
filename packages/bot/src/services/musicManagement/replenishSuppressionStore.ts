import { LRUCache } from 'lru-cache'

// Store suppression state with TTL. Max 10k guilds to prevent unbounded growth.
// Suppression duration varies (typically 5-30 min), use 1 hour TTL as upper bound.
const replenishSuppressedUntil = new LRUCache<string, boolean>({
    max: 10_000,
    ttl: 60 * 60 * 1000, // 1 hour
})

export function setReplenishSuppressed(guildId: string, ms: number): void {
    if (ms <= 0) {
        replenishSuppressedUntil.delete(guildId)
    } else {
        // Store a boolean flag; lru-cache handles TTL automatically.
        // We set a per-entry TTL to match the suppression duration.
        replenishSuppressedUntil.set(guildId, true, { ttl: ms })
    }
}

export function isReplenishSuppressed(guildId: string): boolean {
    // lru-cache automatically expires and deletes entries; .has() respects expiry.
    return replenishSuppressedUntil.has(guildId)
}
