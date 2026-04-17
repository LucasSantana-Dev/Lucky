import { LRUCache } from 'lru-cache'
import { spotifyLinkService } from '@lucky/shared/services'
import { getUserTopArtistsAndTracks } from './spotifyApi'
import { debugLog, errorLog } from '@lucky/shared/utils/general/log'

export interface UserSpotifySeeds {
    artistIds: string[]
    artistNames: Set<string>
    trackIds: string[]
}

interface SeededUserEntry {
    seeds: UserSpotifySeeds
    fetched: number
}

const userSeedsCache = new LRUCache<string, SeededUserEntry>({
    max: 500,
    ttl: 5 * 60 * 1000,
})

const CACHE_TTL_MS = 5 * 60 * 1000

export async function getUserSpotifySeeds(userId: string): Promise<UserSpotifySeeds | null> {
    const now = Date.now()
    const cached = userSeedsCache.get(userId)

    if (cached && now - cached.fetched < CACHE_TTL_MS) {
        debugLog({
            message: 'User Spotify seeds cache hit',
            data: { userId, artistCount: cached.seeds.artistIds.length },
        })
        return cached.seeds
    }

    try {
        const link = await spotifyLinkService.getByDiscordId(userId)
        if (!link) {
            return null
        }

        const token = await spotifyLinkService.getValidAccessToken(userId)
        if (!token) {
            errorLog({
                message: 'Failed to get valid Spotify token for user',
                data: { userId },
            })
            return null
        }

        const seedData = await getUserTopArtistsAndTracks(token)
        if (!seedData) {
            errorLog({
                message: 'Failed to fetch user top artists/tracks',
                data: { userId },
            })
            return null
        }

        const seeds: UserSpotifySeeds = {
            artistIds: seedData.artists.map((a) => a.id),
            artistNames: new Set(seedData.artists.map((a) => a.name.toLowerCase())),
            trackIds: seedData.tracks.map((t) => t.id),
        }

        userSeedsCache.set(userId, {
            seeds,
            fetched: now,
        })

        debugLog({
            message: 'User Spotify seeds fetched and cached',
            data: {
                userId,
                artistCount: seeds.artistIds.length,
                trackCount: seeds.trackIds.length,
            },
        })

        return seeds
    } catch (error) {
        errorLog({
            message: 'Error fetching user Spotify seeds',
            error,
            data: { userId },
        })
        return null
    }
}

export function clearUserSeedsCache(userId: string): void {
    userSeedsCache.delete(userId)
    debugLog({
        message: 'User Spotify seeds cache cleared',
        data: { userId },
    })
}
