import { QueryType, type Track, type GuildQueue } from 'discord-player'
import type { User } from 'discord.js'
import { debugLog } from '@lucky/shared/utils'
import { getArtistTopTracks } from '../../../lastfm'
import {
    cleanSearchQuery,
    cleanTitle,
} from '../searchQueryCleaner'
import type { SessionMood } from './sessionMood'
import { calculateRecommendationScore } from './candidateScorer'
import {
    shouldIncludeCandidate,
    upsertScoredCandidate,
    normalizeTrackKey,
} from '../queueManipulation'

const MAX_AUTOPLAY_DURATION_MS = 10 * 60 * 1000
const SEARCH_RESULTS_LIMIT = 8
const MAX_PREFERRED_ARTISTS_PER_CALL = 5

type ScoredTrack = {
    track: Track
    score: number
    reason: string
}

export async function collectPreferredArtistCandidates(
    queue: GuildQueue,
    requestedBy: User | null,
    preferredArtistNames: Set<string>,
    excludedUrls: Set<string>,
    excludedKeys: Set<string>,
    dislikedWeights: Map<string, number>,
    likedWeights: Map<string, number>,
    preferredArtistKeys: Set<string>,
    blockedArtistKeys: Set<string>,
    currentTrack: Track,
    recentArtists: Set<string>,
    candidates: Map<string, ScoredTrack>,
    autoplayMode: 'similar' | 'discover' | 'popular' = 'similar',
    artistFrequency: Map<string, number> = new Map(),
    implicitDislikeKeys: Set<string> = new Set(),
    implicitLikeKeys: Set<string> = new Set(),
    sessionMood: SessionMood | null = null,
): Promise<void> {
    if (!requestedBy || preferredArtistNames.size === 0) return

    const artistNames = Array.from(preferredArtistNames).slice(
        0,
        MAX_PREFERRED_ARTISTS_PER_CALL,
    )

    for (const artistName of artistNames) {
        const topTracks = await getArtistTopTracks(artistName, 6)
        
        if (topTracks.length === 0) continue

        for (const track of topTracks) {
            const query = cleanSearchQuery(track.title, track.artist)
            
            try {
                const searchResult = await queue.player.search(query, {
                    requestedBy: requestedBy ?? undefined,
                    searchEngine: QueryType.AUTO,
                })

                for (const foundTrack of searchResult.tracks) {
                    if (
                        !foundTrack.durationMS ||
                        foundTrack.durationMS > MAX_AUTOPLAY_DURATION_MS
                    ) {
                        continue
                    }

                    if (
                        !shouldIncludeCandidate(
                            foundTrack,
                            excludedUrls,
                            excludedKeys,
                        )
                    ) {
                        continue
                    }

                    const normalizedKey = normalizeTrackKey(
                        foundTrack.title,
                        foundTrack.author,
                    )
                    const dislikedWeight = dislikedWeights.get(normalizedKey)
                    if (
                        dislikedWeight !== undefined &&
                        dislikedWeight > 0.5
                    ) {
                        continue
                    }

                    const rec = calculateRecommendationScore(
                        foundTrack,
                        currentTrack,
                        recentArtists,
                        likedWeights,
                        preferredArtistKeys,
                        blockedArtistKeys,
                        autoplayMode,
                        artistFrequency,
                        implicitDislikeKeys,
                        implicitLikeKeys,
                        dislikedWeights,
                        sessionMood,
                    )

                    if (rec.score === -Infinity) continue

                    const score = rec.score + 0.3 + 0.2

                    upsertScoredCandidate(candidates, foundTrack, {
                        score,
                        reason: 'preferred artist',
                    })

                    break
                }
            } catch (error) {
                debugLog({
                    message: 'Preferred artist search failed',
                    data: {
                        artistName,
                        trackTitle: track.title,
                        error: String(error),
                    },
                })
            }
        }
    }

    debugLog({
        message: 'Preferred artist candidates collected',
        data: { artistCount: artistNames.length, candidateCount: candidates.size },
    })
}
