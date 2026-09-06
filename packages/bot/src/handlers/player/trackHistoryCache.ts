import { LRUCache } from 'lru-cache'

const MAX_GUILD_ENTRIES = 500
const TRACK_STATE_TTL_MS = 30 * 60 * 1000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const lastPlayedTracks = new LRUCache<string, any>({
    max: MAX_GUILD_ENTRIES,
    ttl: TRACK_STATE_TTL_MS,
    updateAgeOnGet: true,
})

export type TrackHistoryEntry = {
    url: string
    title: string
    author: string
    thumbnail?: string
    timestamp: number
}

export const recentlyPlayedTracks = new LRUCache<string, TrackHistoryEntry[]>({
    max: MAX_GUILD_ENTRIES,
    ttl: TRACK_STATE_TTL_MS,
    updateAgeOnGet: true,
})

export function evictOldEntries(): void {
    for (const [guildId, entries] of recentlyPlayedTracks.entries()) {
        if (entries.length > MAX_GUILD_ENTRIES) {
            recentlyPlayedTracks.set(guildId, entries.slice(-MAX_GUILD_ENTRIES))
        }
    }
}
