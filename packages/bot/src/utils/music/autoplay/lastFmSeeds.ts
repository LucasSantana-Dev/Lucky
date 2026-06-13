import { lastFmLinkService } from '@lucky/shared/services'
import { TtlCache } from '@lucky/shared/utils/cache'
import {
    getTopTracks,
    getRecentTracks,
    getLovedTracks,
} from '../../../lastfm/lastFmApi'
import { debugLog, errorLog } from '@lucky/shared/utils'
import { cleanTitle } from '../searchQueryCleaner'

const CACHE_TTL_MS = 15 * 60 * 1000
const TOP_TRACKS_LIMIT = 50
const RECENT_TRACKS_LIMIT = 30
export const LASTFM_SEED_COUNT = 15

type CacheEntry = {
    tracks: { artist: string; title: string }[]
    lovedKeys: Set<string>
    offset: number
}

// Bounded TTL cache: max 500 users per instance; evicts the oldest-written
// entry (insertion order, not true LRU) plus TTL expiry when over capacity.
const cache = new TtlCache<CacheEntry>({
    ttlMs: CACHE_TTL_MS,
    maxEntries: 500,
})
const consumeLocks = new Map<
    string,
    Promise<{ artist: string; title: string }[]>
>()

function deduplicateTracks(
    tracks: { artist: string; title: string }[],
): { artist: string; title: string }[] {
    const seen = new Set<string>()
    return tracks.filter((t) => {
        if (!t.artist || !t.title) return false
        const normalizedTitle = cleanTitle(t.title).toLowerCase().trim()
        const key = `${t.artist.toLowerCase()}|${normalizedTitle}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
}

export async function getLastFmSeedTracks(
    discordUserId: string,
): Promise<{ artist: string; title: string }[]> {
    const cached = cache.get(discordUserId)
    if (cached) {
        return cached.tracks
    }

    try {
        const link = await lastFmLinkService.getByDiscordId(discordUserId)
        if (!link?.lastFmUsername) return []

        const [lovedTracks, topTracks, recentTracks] = await Promise.all([
            getLovedTracks(link.lastFmUsername, 50),
            getTopTracks(link.lastFmUsername, '3month', TOP_TRACKS_LIMIT),
            getRecentTracks(link.lastFmUsername, RECENT_TRACKS_LIMIT),
        ])

        const merged = deduplicateTracks([
            ...lovedTracks,
            ...topTracks.map((t) => ({ artist: t.artist, title: t.title })),
            ...recentTracks,
        ])

        const lovedKeys = new Set<string>(
            lovedTracks.map(
                (t) =>
                    `${t.artist.toLowerCase()}|${cleanTitle(t.title).toLowerCase().trim()}`,
            ),
        )

        cache.set(discordUserId, {
            tracks: merged,
            lovedKeys,
            offset: 0,
        })

        debugLog({
            message: 'Loaded Last.fm seed tracks',
            data: { discordUserId, count: merged.length },
        })

        return merged
    } catch (error) {
        errorLog({ message: 'Failed to load Last.fm seed tracks', error })
        return []
    }
}

export function getLastFmSeedSlice(
    discordUserId: string,
    count: number = LASTFM_SEED_COUNT,
): { artist: string; title: string }[] {
    const cached = cache.get(discordUserId)
    if (!cached) return []

    const { tracks, offset } = cached
    if (tracks.length === 0) return []

    const sliceSize = Math.min(count, tracks.length)
    const result: { artist: string; title: string }[] = []
    for (let i = 0; i < sliceSize; i++) {
        const idx = offset + i
        if (idx >= tracks.length) break
        result.push(tracks[idx])
    }
    return result
}

function advanceLastFmSeedOffsetBy(
    discordUserId: string,
    amount: number,
): void {
    const cached = cache.get(discordUserId)
    if (!cached) return

    cached.offset = (cached.offset + amount) % cached.tracks.length
}

export function advanceLastFmSeedOffset(discordUserId: string): void {
    advanceLastFmSeedOffsetBy(discordUserId, LASTFM_SEED_COUNT)
}

export function getLastFmCacheOffset(discordUserId: string): number {
    return cache.get(discordUserId)?.offset ?? 0
}

export async function consumeLastFmSeedSlice(
    userId: string,
    count: number = LASTFM_SEED_COUNT,
): Promise<{ artist: string; title: string }[]> {
    const prev = consumeLocks.get(userId) ?? Promise.resolve()
    const next = prev
        .then(async () => {
            await getLastFmSeedTracks(userId)
            const slice = getLastFmSeedSlice(userId, count)
            advanceLastFmSeedOffsetBy(userId, slice.length)
            return slice
        })
        .catch(() => [])
    consumeLocks.set(userId, next)
    return next
}

export async function consumeBlendedSeedSlice(
    userIds: string[],
    count: number,
    weights?: Map<string, number>,
): Promise<{ artist: string; title: string }[]> {
    if (userIds.length === 0) return []

    let sliceSizes: number[]
    if (weights && weights.size > 0) {
        const totalWeight = Array.from(weights.values()).reduce(
            (sum, w) => sum + w,
            0,
        )
        sliceSizes = userIds.map((id) => {
            const weight = weights.get(id) ?? 1
            return Math.max(1, Math.round((count * weight) / totalWeight))
        })
        const sumSlices = sliceSizes.reduce((sum, s) => sum + s, 0)
        if (sumSlices > count) {
            const toRemove = sumSlices - count
            for (let i = 0; i < toRemove && i < sliceSizes.length; i++) {
                if (sliceSizes[i] > 1) sliceSizes[i]--
            }
        }
    } else {
        const perUserCount = Math.ceil(count / userIds.length)
        sliceSizes = userIds.map(() => perUserCount)
    }

    const slices = await Promise.all(
        userIds.map((id, idx) => consumeLastFmSeedSlice(id, sliceSizes[idx])),
    )

    const interleaved: { artist: string; title: string }[] = []
    const maxLen = Math.max(...slices.map((s) => s.length))

    for (let i = 0; i < maxLen; i++) {
        for (const slice of slices) {
            if (i < slice.length) {
                interleaved.push(slice[i])
            }
        }
    }

    const deduped = deduplicateTracks(interleaved)
    return deduped.slice(0, count)
}

export function isLovedSeed(
    discordUserId: string,
    artist: string,
    title: string,
): boolean {
    const cached = cache.get(discordUserId)
    if (!cached?.lovedKeys) return false
    const key = `${artist.toLowerCase()}|${cleanTitle(title).toLowerCase().trim()}`
    return cached.lovedKeys.has(key)
}
