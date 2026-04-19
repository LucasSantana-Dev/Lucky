import { QueryType, type Track, type GuildQueue } from 'discord-player'
import type { User } from 'discord.js'
import { getArtistTopTracks } from '../../../lastfm'
import { cleanSearchQuery } from '../searchQueryCleaner'
import type { SessionMood } from './sessionMood'
import { calculateRecommendationScore } from './candidateScorer'
import {
    shouldIncludeCandidate,
    upsertScoredCandidate,
    normalizeTrackKey,
} from '../queueManipulation'

const MAX_ARTISTS_PER_CALL = 5
const MAX_SIMILAR_LOOKUPS = 6
const SEARCH_RESULTS_LIMIT = 8
const MAX_AUTOPLAY_DURATION_MS = 10 * 60 * 1000
const AUTOPLAY_BUFFER_SIZE = 8
const PREFERRED_ARTIST_SCORE_BOOST = 0.2

type ScoredTrack = {
    track: Track
    score: number
    reason: string
}

let preferredArtistRotationCounter = 0

export async function collectPreferredArtistCandidates(
    queue: GuildQueue,
    requestedBy: User,
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
    preferredArtistNames: string[] = [],
): Promise<void> {
    if (preferredArtistNames.length === 0) return

    const startIdx = (preferredArtistRotationCounter % preferredArtistNames.length)
    const slice = preferredArtistNames.slice(startIdx, startIdx + MAX_ARTISTS_PER_CALL)
    preferredArtistRotationCounter += slice.length

    for (const artistName of slice) {
        if (!artistName || artistName.trim().length === 0) continue

        const normalizedArtistKey = artistName
            .toLowerCase()
            .replaceAll(/[^a-z0-9]+/g, '')
            .trim()

        if (blockedArtistKeys.has(normalizedArtistKey)) continue

        const topTracks = await getArtistTopTracks(artistName, 6)
        if (topTracks.length === 0) continue

        for (const track of topTracks) {
            const query = cleanSearchQuery(track.title, track.artist)
            const searchTracks = await searchLastFmQuery(queue, query, requestedBy)
            for (const searchedTrack of searchTracks) {
                if (!shouldIncludeCandidate(searchedTrack, excludedUrls, excludedKeys))
                    continue
                const normalizedKey = normalizeTrackKey(
                    searchedTrack.title,
                    searchedTrack.author,
                )
                const dislikedWeight = dislikedWeights.get(normalizedKey)
                if (dislikedWeight !== undefined && dislikedWeight > 0.5) continue

                const rec = calculateRecommendationScore(
                    searchedTrack,
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
                    true,
                )
                if (rec.score === -Infinity) continue

                upsertScoredCandidate(candidates, searchedTrack, {
                    score: rec.score + PREFERRED_ARTIST_SCORE_BOOST,
                    reason: rec.reason
                        ? `${rec.reason} • preferred artist`
                        : 'preferred artist',
                })
            }
        }

        if (candidates.size >= AUTOPLAY_BUFFER_SIZE) break
    }
}

export async function searchLastFmQuery(
    queue: GuildQueue,
    query: string,
    requestedBy: User,
): Promise<Track[]> {
    const engines: QueryType[] = [
        QueryType.SPOTIFY_SEARCH,
        QueryType.YOUTUBE_SEARCH,
        QueryType.AUTO,
    ]
    for (const engine of engines) {
        try {
            const result = await queue.player.search(query, {
                requestedBy,
                searchEngine: engine,
            })
            const tracks = result.tracks
                .filter(
                    (t) =>
                        !t.durationMS ||
                        t.durationMS <= MAX_AUTOPLAY_DURATION_MS,
                )
                .slice(0, SEARCH_RESULTS_LIMIT)
            if (tracks.length > 0) return tracks
        } catch {
            continue
        }
    }
    return []
}
