import { lastFmLinkService } from '@lucky/shared/services'
import { getTopTracks } from '../../../lastfm'
import { debugLog, errorLog } from '@lucky/shared/utils'

const CACHE_TTL_MS = 60 * 60 * 1000
const TOP_TRACKS_LIMIT = 20

type CacheEntry = {
    tracks: { artist: string; title: string }[]
    expiresAt: number
}

const cache = new Map<string, CacheEntry>()

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

        const topTracks = await getTopTracks(
            link.lastFmUsername,
            '3month',
            TOP_TRACKS_LIMIT,
        )
        const tracks = topTracks.map((t) => ({
            artist: t.artist,
            title: t.title,
        }))

        cache.set(discordUserId, {
            tracks,
            expiresAt: Date.now() + CACHE_TTL_MS,
        })

        debugLog({
            message: 'Loaded Last.fm seed tracks',
            data: { discordUserId, count: tracks.length },
        })

        return tracks
    } catch (error) {
        errorLog({ message: 'Failed to load Last.fm seed tracks', error })
        return []
    }
}
