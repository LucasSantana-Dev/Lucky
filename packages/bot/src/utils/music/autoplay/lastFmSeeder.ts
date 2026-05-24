import { QueryType, type Track, type GuildQueue } from 'discord-player'
import type { User } from 'discord.js'
import { lastFmLinkService } from '@lucky/shared/services'
import {
    consumeLastFmSeedSlice,
    consumeBlendedSeedSlice,
    isLovedSeed,
    LASTFM_SEED_COUNT,
} from './lastFmSeeds'
import { getSimilarTracks, getTagTopTracks } from '../../../lastfm'
import { createArtistTagFetcher, type ArtistTagFetcher } from './artistTagCache'
import { cleanSearchQuery, cleanTitle } from '../searchQueryCleaner'
import type { SessionMood } from './sessionMood'
import type { AutoplayContext } from './autoplayContext'
import { calculateRecommendationScore } from './candidateScorer'
import { normalizeTrackKey } from './scoringUtils'
import {
    shouldIncludeCandidate,
    upsertScoredCandidate,
} from './candidateCollector'
import type { QueueMetadata } from '../../../types/QueueMetadata'
import type { ScoredTrack } from './diversitySelector'
import type { AutoplayAuditCollector } from './autoplayAudit'

const LASTFM_SCORE_BOOST = 0.2
const LOVED_SEED_EXTRA_BOOST = 0.1
const MAX_SIMILAR_LOOKUPS = 15
const SEARCH_RESULTS_LIMIT = 8
const MAX_AUTOPLAY_DURATION_MS = 10 * 60 * 1000
const AUTOPLAY_BUFFER_SIZE = 8

export async function collectLastFmCandidates(
    ctx: AutoplayContext,
    requestedBy: User,
    candidates: Map<string, ScoredTrack>,
    contributionWeights?: Map<string, number>,
    auditCollector?: AutoplayAuditCollector,
): Promise<void> {
    const metadata = ctx.queue.metadata as QueueMetadata
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

    const getArtistTags =
        ctx.genreContext.getArtistTags ?? createArtistTagFetcher()
    const currentTrackTags = ctx.genreContext.currentTrackTags ?? []
    const sessionGenreFamilies =
        ctx.genreContext.sessionGenreFamilies ?? new Set<string>()

    for (const seed of seedSlice) {
        if (candidates.size >= AUTOPLAY_BUFFER_SIZE) break
        const lovedBoost = isLovedSeed(requestedBy.id, seed.artist, seed.title)
            ? LOVED_SEED_EXTRA_BOOST
            : 0
        const query = cleanSearchQuery(seed.title, seed.artist)
        const tracks = await searchLastFmQuery(ctx.queue, query, requestedBy)
        for (const track of tracks) {
            if (
                !shouldIncludeCandidate(
                    track,
                    ctx.excludedUrls,
                    ctx.excludedKeys,
                )
            )
                continue
            const normalizedKey = normalizeTrackKey(track.title, track.author)
            const dislikedWeight = ctx.dislikedWeights.get(normalizedKey)
            if (dislikedWeight !== undefined && dislikedWeight > 0.5) continue
            const tags = await getArtistTags(track.author)
            const rec = calculateRecommendationScore({
                candidate: track,
                currentTrack: ctx.currentTrack,
                recentArtists: ctx.recentArtists,
                likedWeights: ctx.likedWeights,
                preferredArtistKeys: ctx.preferredArtistKeys,
                blockedArtistKeys: ctx.blockedArtistKeys,
                autoplayMode: ctx.autoplayMode,
                artistFrequency: ctx.artistFrequency,
                implicitDislikeKeys: ctx.implicitDislikeKeys,
                implicitLikeKeys: ctx.implicitLikeKeys,
                dislikedWeights: ctx.dislikedWeights,
                sessionMood: ctx.sessionMood,
                skipNoveltyBoost: true,
                genreContext: {
                    candidateTags: tags,
                    currentTrackTags,
                    sessionGenreFamilies,
                },
            })
            upsertScoredCandidate(
                candidates,
                track,
                {
                    score: rec.score + LASTFM_SCORE_BOOST + lovedBoost,
                    source: 'lastfm-loved',
                    signals: rec.signals,
                },
                auditCollector,
            )
        }

        const similar = await getSimilarTracks(
            seed.artist,
            cleanTitle(seed.title),
        )
        for (const s of similar.slice(0, MAX_SIMILAR_LOOKUPS)) {
            const query = cleanSearchQuery(s.title, s.artist)
            const tracks = await searchLastFmQuery(
                ctx.queue,
                query,
                requestedBy,
            )
            for (const track of tracks) {
                if (
                    !shouldIncludeCandidate(
                        track,
                        ctx.excludedUrls,
                        ctx.excludedKeys,
                    )
                )
                    continue
                const normalizedKey = normalizeTrackKey(
                    track.title,
                    track.author,
                )
                const dislikedWeight = ctx.dislikedWeights.get(normalizedKey)
                if (dislikedWeight !== undefined && dislikedWeight > 0.5)
                    continue
                const tags = await getArtistTags(track.author)
                const rec = calculateRecommendationScore({
                    candidate: track,
                    currentTrack: ctx.currentTrack,
                    recentArtists: ctx.recentArtists,
                    likedWeights: ctx.likedWeights,
                    preferredArtistKeys: ctx.preferredArtistKeys,
                    blockedArtistKeys: ctx.blockedArtistKeys,
                    autoplayMode: ctx.autoplayMode,
                    artistFrequency: ctx.artistFrequency,
                    implicitDislikeKeys: ctx.implicitDislikeKeys,
                    implicitLikeKeys: ctx.implicitLikeKeys,
                    dislikedWeights: ctx.dislikedWeights,
                    sessionMood: ctx.sessionMood,
                    skipNoveltyBoost: true,
                    genreContext: {
                        candidateTags: tags,
                        currentTrackTags,
                        sessionGenreFamilies,
                    },
                })
                upsertScoredCandidate(
                    candidates,
                    track,
                    {
                        score:
                            (rec.score + LASTFM_SCORE_BOOST) * (s.match / 100),
                        source: 'lastfm-similar',
                        signals: rec.signals,
                    },
                    auditCollector,
                )
            }
            if (candidates.size >= AUTOPLAY_BUFFER_SIZE) break
        }
    }

    // Sparse-artist fallback: if similar tracks yielded < 3 candidates,
    // use the current track's dominant genre tag to find tracks in-genre.
    if (candidates.size < 3 && seedSlice.length > 0) {
        const dominantTags = await getArtistTags(ctx.currentTrack.author)
        const dominantTag = dominantTags[0]
        if (dominantTag) {
            const tagTracks = await getTagTopTracks(dominantTag, 20).catch(
                () => [],
            )
            for (const t of tagTracks.slice(0, 5)) {
                const tagQuery = cleanSearchQuery(t.title, t.artist)
                const found = await searchLastFmQuery(
                    ctx.queue,
                    tagQuery,
                    requestedBy,
                )
                for (const track of found) {
                    if (
                        !shouldIncludeCandidate(
                            track,
                            ctx.excludedUrls,
                            ctx.excludedKeys,
                        )
                    )
                        continue
                    const normalizedKey = normalizeTrackKey(
                        track.title,
                        track.author,
                    )
                    const dislikedWeight =
                        ctx.dislikedWeights.get(normalizedKey)
                    if (dislikedWeight !== undefined && dislikedWeight > 0.5)
                        continue
                    const tags = await getArtistTags(track.author)
                    const rec = calculateRecommendationScore({
                        candidate: track,
                        currentTrack: ctx.currentTrack,
                        recentArtists: ctx.recentArtists,
                        likedWeights: ctx.likedWeights,
                        preferredArtistKeys: ctx.preferredArtistKeys,
                        blockedArtistKeys: ctx.blockedArtistKeys,
                        autoplayMode: ctx.autoplayMode,
                        artistFrequency: ctx.artistFrequency,
                        implicitDislikeKeys: ctx.implicitDislikeKeys,
                        implicitLikeKeys: ctx.implicitLikeKeys,
                        dislikedWeights: ctx.dislikedWeights,
                        sessionMood: ctx.sessionMood,
                        skipNoveltyBoost: true,
                        genreContext: {
                            candidateTags: tags,
                            currentTrackTags,
                            sessionGenreFamilies,
                        },
                    })
                    upsertScoredCandidate(
                        candidates,
                        track,
                        {
                            score: rec.score + LASTFM_SCORE_BOOST,
                            source: 'lastfm-genre-fallback',
                            signals: rec.signals,
                        },
                        auditCollector,
                    )
                }
                if (candidates.size >= 3) break
            }
        }
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
