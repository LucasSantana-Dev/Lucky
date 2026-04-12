import {
    getUserTopTracks,
    getUserSavedTracks,
} from '../../../spotify/spotifyApi'
import { debugLog, errorLog } from '@lucky/shared/utils'

let spotifyLinkService: any = null
try {
    spotifyLinkService = require('@lucky/shared/services').spotifyLinkService
} catch {
    // spotifyLinkService not available yet (PR #574 not merged)
}

const CACHE_TTL_MS = 15 * 60 * 1000
const TOP_TRACKS_LIMIT = 50
const SAVED_TRACKS_LIMIT = 50
export const SPOTIFY_SEED_COUNT = 5

type CacheEntry = {
    tracks: { artist: string; title: string }[]
    offset: number
    expiresAt: number
}

const cache = new Map<string, CacheEntry>()
const consumeLocks = new Map<
    string,
    Promise<{ artist: string; title: string }[]>
>()

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

export async function getSpotifySeedTracks(
    userId: string,
): Promise<{ artist: string; title: string }[]> {
    const cached = cache.get(userId)
    if (cached && cached.expiresAt > Date.now()) {
        return cached.tracks
    }

    try {
        if (!spotifyLinkService) return []

        const accessToken = await spotifyLinkService.getValidAccessToken(userId)
        if (!accessToken) return []

        const [topTracks, savedTracks] = await Promise.all([
            getUserTopTracks(accessToken, 'medium_term', TOP_TRACKS_LIMIT),
            getUserSavedTracks(accessToken, SAVED_TRACKS_LIMIT),
        ])

        const merged = deduplicateTracks([...topTracks, ...savedTracks])

        cache.set(userId, {
            tracks: merged,
            offset: 0,
            expiresAt: Date.now() + CACHE_TTL_MS,
        })

        debugLog({
            message: 'Loaded Spotify seed tracks',
            data: { userId, count: merged.length },
        })

        return merged
    } catch (error) {
        errorLog({ message: 'Failed to load Spotify seed tracks', error })
        return []
    }
}

export function getSpotifySeedSlice(
    userId: string,
    count: number = SPOTIFY_SEED_COUNT,
): { artist: string; title: string }[] {
    const cached = cache.get(userId)
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

function advanceSpotifySeedOffsetBy(userId: string, amount: number): void {
    const cached = cache.get(userId)
    if (!cached) return

    cached.offset = (cached.offset + amount) % cached.tracks.length
}

export function advanceSpotifySeedOffset(userId: string): void {
    advanceSpotifySeedOffsetBy(userId, SPOTIFY_SEED_COUNT)
}

export function getSpotifyCacheOffset(userId: string): number {
    return cache.get(userId)?.offset ?? 0
}

export async function consumeSpotifySeedSlice(
    userId: string,
    count: number = SPOTIFY_SEED_COUNT,
): Promise<{ artist: string; title: string }[]> {
    const prev = consumeLocks.get(userId) ?? Promise.resolve()
    const next = prev
        .then(async () => {
            await getSpotifySeedTracks(userId)
            const slice = getSpotifySeedSlice(userId, count)
            advanceSpotifySeedOffsetBy(userId, slice.length)
            return slice
        })
        .catch(() => [])
    consumeLocks.set(userId, next)
    return next
}
