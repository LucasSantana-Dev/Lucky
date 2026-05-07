import { type Track } from 'discord-player'
import { LRUCache } from 'lru-cache'
import { debugLog } from '@lucky/shared/utils'
import { spotifyLinkService } from '@lucky/shared/services'
import {
    getAudioFeatures,
    searchSpotifyTrack,
    type SpotifyAudioFeatures,
} from '../../spotify/spotifyApi'
import { cleanTitle, cleanAuthor } from './searchQueryCleaner'
import { normalizeTrackKey } from './trackNormalization'
import {
    collectRecommendationCandidates,
    shouldIncludeCandidate,
    upsertScoredCandidate,
    type ScoredTrack,
} from './autoplay/candidateCollector'
import { collectLastFmCandidates } from './autoplay/lastFmSeeder'
import { replenishQueue } from './autoplay/replenisher'
import { calculateRecommendationScore } from './autoplay/candidateScorer'

export { collectLastFmCandidates }
export { replenishQueue }
export {
    collectRecommendationCandidates,
    shouldIncludeCandidate,
    upsertScoredCandidate,
    type ScoredTrack,
}
export { calculateRecommendationScore }

export * from './trackNormalization'
export * from './queueEditOps'
export * from './candidateFallback'
export * from './queueRescue'

interface AudioFeatureEntry {
    value: SpotifyAudioFeatures | null
}

const audioFeatureCache = new LRUCache<string, AudioFeatureEntry>({
    max: 5000,
    ttl: 24 * 60 * 60 * 1000,
})

export async function getTrackAudioFeatures(
    track: Track,
    userId: string,
): Promise<SpotifyAudioFeatures | null> {
    const cacheKey = normalizeTrackKey(track.title, track.author)

    const cached = audioFeatureCache.get(cacheKey)
    if (cached !== undefined) {
        debugLog({
            message: 'Audio feature cache hit',
            data: { cacheKey, hasValue: cached.value !== null },
        })
        return cached.value
    }

    debugLog({
        message: 'Audio feature cache miss',
        data: { cacheKey, cacheSize: audioFeatureCache.size },
    })

    const token = await spotifyLinkService.getValidAccessToken(userId)
    if (!token) {
        audioFeatureCache.set(cacheKey, { value: null })
        return null
    }

    let spotifyId: string | null = null

    if (track.url && track.url.includes('open.spotify.com/track/')) {
        const match = track.url.match(/track\/([a-zA-Z0-9]+)/)
        if (match) {
            spotifyId = match[1]
        }
    }

    if (!spotifyId) {
        spotifyId = await searchSpotifyTrack(
            token,
            cleanTitle(track.title ?? ''),
            cleanAuthor(track.author ?? ''),
        )
    }

    if (!spotifyId) {
        audioFeatureCache.set(cacheKey, { value: null })
        return null
    }

    const features = await getAudioFeatures(token, spotifyId).catch(() => null)
    audioFeatureCache.set(cacheKey, { value: features })
    return features
}
