import { QueryType, type Track, type GuildQueue } from 'discord-player'
import type { User } from 'discord.js'
import { logAndSwallow } from '@lucky/shared/utils/error'
import { assertDefined } from '@lucky/shared/utils/guards'
import type { AutoplayContext } from './autoplay/autoplayContext'
import { getTagTopTracks } from '../../lastfm'
import {
    searchLastFmQuery,
    recordSpotifySearchResult,
} from './autoplay/lastFmSeeder'
import {
    shouldIncludeCandidate,
    upsertScoredCandidate,
    type ScoredTrack,
} from './autoplay/candidateCollector'
import { calculateRecommendationScore } from './autoplay/candidateScorer'
import type { SessionMood } from './autoplay/sessionMood'
import {
    createArtistTagFetcher,
    type ArtistTagFetcher,
} from './autoplay/artistTagCache'
import type { AutoplayAuditCollector } from './autoplay/autoplayAudit'
import {
    cleanSearchQuery,
    cleanAuthor,
} from '../../utils/music/searchQueryCleaner'
import { normalizeTrackKey } from '../../utils/music/trackNormalization'

const AUTOPLAY_BUFFER_SIZE = 8
const SEARCH_RESULTS_LIMIT = 8
const MAX_AUTOPLAY_DURATION_MS = 10 * 60 * 1000
const GENRE_SCORE_BOOST = 0.1
const MAX_GENRES = 3
const MAX_TRACKS_PER_GENRE = 20
// Tag lookups per search: each is a Last.fm call.
const MAX_TAGGED_RESULTS_PER_SEARCH = 3

export interface CandidateContext {
    candidates: Map<string, ScoredTrack>
    recentArtists: Set<string>
    likedTrackKeys: Map<string, number>
    dislikedTrackKeys: Map<string, number>
    likedArtistWeights?: Map<string, number>
    dislikedArtistWeights?: Map<string, number>
    currentTrack: Track
    excludedUrls: Set<string>
    excludedKeys: Set<string>
    preferredArtistKeys: Set<string>
    blockedArtistKeys: Set<string>
    autoplayMode: 'similar' | 'discover' | 'popular'
    artistFrequency?: Map<string, number>
    implicitDislikeKeys?: Set<string>
    implicitLikeKeys?: Set<string>
    sessionMood?: SessionMood | null
    genreContext?: {
        currentTrackTags?: string[]
        sessionGenreFamilies?: Set<string>
        getArtistTags?: ArtistTagFetcher
    }
    auditCollector?: AutoplayAuditCollector
}

function isGenreTrackAllowed(track: Track, ctx: CandidateContext): boolean {
    if (
        !shouldIncludeCandidate(
            track,
            ctx.excludedUrls,
            ctx.excludedKeys,
            ctx.candidates,
        )
    )
        return false
    const key = normalizeTrackKey(track.title, track.author)
    const dislikedWeight = ctx.dislikedTrackKeys.get(key)
    return dislikedWeight === undefined || dislikedWeight <= 0.5
}

function addGenreTrackCandidate(
    track: Track,
    candidateTags: string[],
    ctx: CandidateContext,
): void {
    const rec = calculateRecommendationScore({
        candidate: track,
        currentTrack: ctx.currentTrack,
        recentArtists: ctx.recentArtists,
        likedWeights: ctx.likedTrackKeys,
        likedArtistWeights: ctx.likedArtistWeights,
        dislikedArtistWeights: ctx.dislikedArtistWeights,
        preferredArtistKeys: ctx.preferredArtistKeys,
        blockedArtistKeys: ctx.blockedArtistKeys,
        autoplayMode: ctx.autoplayMode,
        artistFrequency: ctx.artistFrequency,
        implicitDislikeKeys: ctx.implicitDislikeKeys,
        implicitLikeKeys: ctx.implicitLikeKeys,
        dislikedWeights: ctx.dislikedTrackKeys,
        sessionMood: ctx.sessionMood,
        genreContext: {
            candidateTags,
            currentTrackTags: ctx.genreContext?.currentTrackTags,
            sessionGenreFamilies: ctx.genreContext?.sessionGenreFamilies,
        },
    })
    upsertScoredCandidate(
        ctx.candidates,
        track,
        {
            score: rec.score + GENRE_SCORE_BOOST,
            source: 'genre-tag',
            signals: rec.signals,
        },
        ctx.auditCollector,
    )
}

export async function collectBroadFallbackCandidates(
    ctx: AutoplayContext,
    candidates: Map<string, ScoredTrack>,
    auditCollector?: AutoplayAuditCollector,
): Promise<void> {
    const getArtistTags =
        ctx.genreContext.getArtistTags ?? createArtistTagFetcher()
    const currentTrackTags = ctx.genreContext.currentTrackTags ?? []
    const sessionGenreFamilies =
        ctx.genreContext.sessionGenreFamilies ?? new Set<string>()

    const fallbackQueries = [
        ctx.currentTrack.author,
        `${ctx.currentTrack.author} popular`,
    ].filter(Boolean)

    for (const query of fallbackQueries) {
        try {
            const result = await ctx.queue.player.search(query, {
                requestedBy: undefined,
                searchEngine: QueryType.SPOTIFY_SEARCH,
            })

            // Sample the raw API count: a result whose tracks all exceed the
            // duration cap is a genuine hit, not an outage signal.
            recordSpotifySearchResult(result.tracks.length > 0)

            const tracks = result.tracks
                .filter(
                    (t: Track) =>
                        !t.durationMS ||
                        t.durationMS <= MAX_AUTOPLAY_DURATION_MS,
                )
                .slice(0, SEARCH_RESULTS_LIMIT)

            for (const track of tracks) {
                if (
                    !shouldIncludeCandidate(
                        track,
                        ctx.excludedUrls,
                        ctx.excludedKeys,
                        candidates,
                    )
                )
                    continue
                const key = normalizeTrackKey(track.title, track.author)
                const dislikedWeight = ctx.dislikedWeights.get(key)
                if (dislikedWeight !== undefined && dislikedWeight > 0.5)
                    continue
                const candidateTags = await getArtistTags(track.author).catch(
                    (err: unknown) => {
                        logAndSwallow(err, 'candidateFallback.getArtistTags', {
                            author: track.author,
                        })
                        return [] as string[]
                    },
                )
                const rec = calculateRecommendationScore({
                    candidate: track,
                    currentTrack: ctx.currentTrack,
                    recentArtists: ctx.recentArtists,
                    likedWeights: ctx.likedWeights,
                    likedArtistWeights: ctx.likedArtistWeights,
                    dislikedArtistWeights: ctx.dislikedArtistWeights,
                    preferredArtistKeys: ctx.preferredArtistKeys,
                    blockedArtistKeys: ctx.blockedArtistKeys,
                    autoplayMode: ctx.autoplayMode,
                    artistFrequency: ctx.artistFrequency,
                    implicitDislikeKeys: ctx.implicitDislikeKeys,
                    implicitLikeKeys: ctx.implicitLikeKeys,
                    dislikedWeights: ctx.dislikedWeights,
                    sessionMood: ctx.sessionMood,
                    genreContext: {
                        candidateTags,
                        currentTrackTags,
                        sessionGenreFamilies,
                    },
                })
                upsertScoredCandidate(
                    candidates,
                    track,
                    {
                        score: rec.score - 0.1,
                        source: 'artist-fallback',
                        signals: rec.signals,
                    },
                    auditCollector,
                )
            }
        } catch (err: unknown) {
            recordSpotifySearchResult(false)
            logAndSwallow(err, 'candidateFallback.spotifySearch', { query })
            continue
        }
    }
}

export async function collectGenreCandidates(
    queue: GuildQueue,
    genres: string[],
    requestedBy: User,
    ctx: CandidateContext,
): Promise<void> {
    const getArtistTags =
        ctx.genreContext?.getArtistTags ?? createArtistTagFetcher()
    for (const tag of genres.slice(0, MAX_GENRES)) {
        if (ctx.candidates.size >= AUTOPLAY_BUFFER_SIZE) break
        let seeds: Awaited<ReturnType<typeof getTagTopTracks>> = []
        try {
            seeds = await getTagTopTracks(tag, MAX_TRACKS_PER_GENRE)
        } catch (err: unknown) {
            logAndSwallow(err, 'candidateFallback.getTagTopTracks', { tag })
            continue
        }
        for (const seed of seeds) {
            if (ctx.candidates.size >= AUTOPLAY_BUFFER_SIZE) break
            try {
                const results = await searchLastFmQuery(
                    queue,
                    cleanSearchQuery(seed.title, seed.artist),
                    requestedBy,
                )
                const allowed = results
                    .filter((track) => isGenreTrackAllowed(track, ctx))
                    .slice(0, MAX_TAGGED_RESULTS_PER_SEARCH)
                // Score on the artist's real tags (#2934): the configured tag
                // would pass the genre check for any search hit. A failed
                // lookup stays untagged so the scorer's fail-closed path runs.
                const tagged = await Promise.all(
                    allowed.map(async (track) => ({
                        track,
                        tags: await getArtistTags(track.author).catch(
                            (err: unknown) => {
                                logAndSwallow(
                                    err,
                                    'candidateFallback.getArtistTags',
                                    { author: track.author },
                                )
                                return [] as string[]
                            },
                        ),
                    })),
                )
                for (const { track, tags } of tagged)
                    addGenreTrackCandidate(track, tags, ctx)
            } catch (err: unknown) {
                logAndSwallow(err, 'candidateFallback.searchLastFmQuery', {
                    tag,
                    seed: `${seed.artist}/${seed.title}`,
                })
                continue
            }
        }
    }
}

export function interleaveByArtist(tracks: ScoredTrack[]): ScoredTrack[] {
    const groups = new Map<string, ScoredTrack[]>()
    for (const t of tracks) {
        const key = cleanAuthor(t.track.author).toLowerCase()
        const group = groups.get(key) ?? []
        group.push(t)
        groups.set(key, group)
    }
    const result: ScoredTrack[] = []
    let added = true
    let round = 0
    while (added) {
        added = false
        for (const group of groups.values()) {
            if (round < group.length) {
                result.push(
                    assertDefined(
                        group[round],
                        'element present after length check',
                    ),
                )
                added = true
            }
        }
        round++
    }
    return result
}
