import { lastFmLinkService } from '@lucky/shared/services'
import {
    getTopTracks,
    getRecentTracks,
    getSimilarTracks,
} from '../../../lastfm'
import { debugLog, errorLog } from '@lucky/shared/utils'

const CACHE_TTL_MS = 15 * 60 * 1000
const TOP_TRACKS_LIMIT = 50
const RECENT_TRACKS_LIMIT = 30
export const LASTFM_SEED_COUNT = 5

type CacheEntry = {
    tracks: { artist: string; title: string }[]
    offset: number
    expiresAt: number
}

const cache = new Map<string, CacheEntry>()

function deduplicateTracks(
    tracks: { artist: string; title: string }[],
): { artist: string; title: string }[] {
    const seen = new Set<string>()
    return tracks.filter((t) => {
        const key = `${t.artist.toLowerCase()}|${t.title.toLowerCase()}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
}

export async function getLastFmSeedTracks(
    discordUserId: string,
): Promise<{ artist: string; title: string }[]> {
    const cached = cache.get(discordUserId)
    if (cached && cached.expiresAt > Date.now()) {
        return cached.tracks
    }

    try {
        const link = await lastFmLinkService.getByDiscordId(discordUserId)
        if (!link?.lastFmUsername) return []

        const [topTracks, recentTracks] = await Promise.all([
            getTopTracks(link.lastFmUsername, '3month', TOP_TRACKS_LIMIT),
            getRecentTracks(link.lastFmUsername, RECENT_TRACKS_LIMIT),
        ])

        const merged = deduplicateTracks([
            ...topTracks.map((t) => ({ artist: t.artist, title: t.title })),
            ...recentTracks,
        ])

        cache.set(discordUserId, {
            tracks: merged,
            offset: 0,
            expiresAt: Date.now() + CACHE_TTL_MS,
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

    const result: { artist: string; title: string }[] = []
    for (let i = 0; i < count && result.length < count; i++) {
        const idx = (offset + i) % tracks.length
        result.push(tracks[idx])
    }
    return result
}

export function advanceLastFmSeedOffset(discordUserId: string): void {
    const cached = cache.get(discordUserId)
    if (!cached) return

    cached.offset = (cached.offset + LASTFM_SEED_COUNT) % cached.tracks.length
}

export function getLastFmCacheOffset(discordUserId: string): number {
    return cache.get(discordUserId)?.offset ?? 0
}
