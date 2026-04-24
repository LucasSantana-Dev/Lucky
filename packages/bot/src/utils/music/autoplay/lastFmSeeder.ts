import { QueryType, type Track, type GuildQueue } from 'discord-player'
import type { User } from 'discord.js'
import { lastFmLinkService } from '@lucky/shared/services'
import {
    consumeLastFmSeedSlice,
    consumeBlendedSeedSlice,
} from './lastFmSeeds'
import { getSimilarTracks, getArtistTopTags } from '../../../lastfm'
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
import type { QueueMetadata } from '../../../types/QueueMetadata'

const LASTFM_SEED_COUNT = 3
const LASTFM_SCORE_BOOST = 0.0
const MAX_SIMILAR_LOOKUPS = 5
const SEARCH_RESULTS_LIMIT = 8
const MAX_AUTOPLAY_DURATION_MS = 10 * 60 * 1000
const AUTOPLAY_BUFFER_SIZE = 8

type ScoredTrack = {
    track: Track
    score: number
    reason: string
}

export async function collectLastFmCandidates(
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
    contributionWeights?: Map<string, number>,
): Promise<void> {
    const metadata = queue.metadata as QueueMetadata
    const vcMemberIds = metadata?.vcMemberIds ?? []

    const otherUserIds = vcMemberIds.filter((id) => id !== requestedBy.id)

    let seedSlice: { artist: string; title: string }[] = []
    if (otherUserIds.length > 0) {
        const linkedUsers = await Promise.all(
            [requestedBy.id, ...otherUserIds].map(async (id) => {
                const link = await lastFmLinkService.getByDiscordId(id)
                return link?.lastFmUsername ? id : null
            }),
        )
        const linkedUserIds = linkedUsers.filter(
            (id) => id !== null,
        ) as string[]

        if (linkedUserIds.length > 1) {
            seedSlice = await consumeBlendedSeedSlice(
                linkedUserIds,
                LASTFM_SEED_COUNT,
                contributionWeights,
            )
        } else if (linkedUserIds.length === 1) {
            seedSlice = await consumeLastFmSeedSlice(
                linkedUserIds[0],
                LASTFM_SEED_COUNT,
            )
        }
    } else {
        seedSlice = await consumeLastFmSeedSlice(
            requestedBy.id,
            LASTFM_SEED_COUNT,
        )
    }

    if (seedSlice.length === 0) return

    // Per-call cache so we only ask Last.fm for each artist once across all
    // seed/similar lookups in this replenish pass. Each entry also short-
    // circuits when Last.fm is not configured (returns []).
    const artistTagCache = new Map<string, Promise<string[]>>()

    for (const seed of seedSlice) {
        const query = cleanSearchQuery(seed.title, seed.artist)
        const tracks = await searchLastFmQuery(queue, query, requestedBy)
        for (const track of tracks) {
            if (!shouldIncludeCandidate(track, excludedUrls, excludedKeys))
                continue
            const normalizedKey = normalizeTrackKey(track.title, track.author)
            const dislikedWeight = dislikedWeights.get(normalizedKey)
            if (dislikedWeight !== undefined && dislikedWeight > 0.5) continue
            const tags = await getArtistTagsForCandidate(
                track.author,
                artistTagCache,
            )
            const rec = calculateRecommendationScore(
                track,
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
                tags,
            )
            if (rec.score === -Infinity) continue
            upsertScoredCandidate(candidates, track, {
                score: rec.score + LASTFM_SCORE_BOOST,
                reason: rec.reason
                    ? `${rec.reason} • last.fm taste`
                    : 'last.fm taste',
            })
        }

        const similar = await getSimilarTracks(
            seed.artist,
            cleanTitle(seed.title),
        )
        for (const s of similar.slice(0, MAX_SIMILAR_LOOKUPS)) {
            const query = cleanSearchQuery(s.title, s.artist)
            const tracks = await searchLastFmQuery(queue, query, requestedBy)
            for (const track of tracks) {
                if (!shouldIncludeCandidate(track, excludedUrls, excludedKeys))
                    continue
                const normalizedKey = normalizeTrackKey(
                    track.title,
                    track.author,
                )
                const dislikedWeight = dislikedWeights.get(normalizedKey)
                if (dislikedWeight !== undefined && dislikedWeight > 0.5)
                    continue
                const tags = await getArtistTagsForCandidate(
                    track.author,
                    artistTagCache,
                )
                const rec = calculateRecommendationScore(
                    track,
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
                    tags,
                )
                if (rec.score === -Infinity) continue
                upsertScoredCandidate(candidates, track, {
                    score: (rec.score + LASTFM_SCORE_BOOST) * (s.match / 100),
                    reason: rec.reason
                        ? `${rec.reason} • similar to your taste`
                        : 'similar to your taste',
                })
            }
            if (candidates.size >= AUTOPLAY_BUFFER_SIZE) break
        }
    }
}

async function getArtistTagsForCandidate(
    artist: string | undefined,
    cache: Map<string, Promise<string[]>>,
): Promise<string[]> {
    if (!artist) return []
    const key = artist.toLowerCase().trim()
    if (!key) return []
    const cached = cache.get(key)
    if (cached) return cached
    const pending = getArtistTopTags(artist).catch(() => [])
    cache.set(key, pending)
    return pending
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
