import { QueryType, type Track, type GuildQueue } from 'discord-player'
import type { User } from 'discord.js'
import { logAndSwallow } from '@lucky/shared/utils/error'
import { assertDefined } from '@lucky/shared/utils/guards'
import type {
    AutoplayContext,
    SpotifySearchBudget,
} from './autoplay/autoplayContext'
import { getTagTopTracks } from '../../lastfm'
import {
    searchLastFmQuery,
    recordSpotifySearchResult,
    claimSpotifySearch,
    spotifySearchBudgetFor,
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
import {
    normalizeTrackKey,
    primaryArtistKey,
} from '../../utils/music/trackNormalization'

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
    seedArtistStreak?: number
    genreContext?: {
        currentTrackTags?: string[]
        sessionGenreFamilies?: Set<string>
        getArtistTags?: ArtistTagFetcher
    }
    auditCollector?: AutoplayAuditCollector
    /** Shared with the other collectors of this replenish pass (#2971). */
    spotifySearchBudget?: SpotifySearchBudget
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
        seedArtistStreak: ctx.seedArtistStreak,
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
            veto: rec.veto,
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
    // The queries name the current artist, so only that artist's tracks
    // belong here: a text search for "Michael Jackson" also returns karaoke
    // labels whose titles credit him ("made popular by Michael Jackson").
    const currentArtist = primaryArtistKey(ctx.currentTrack.author)

    const budget = spotifySearchBudgetFor(ctx)
    for (const query of fallbackQueries) {
        let found: Track[]
        let viaSpotify: boolean
        try {
            const result = await searchFallbackQuery(ctx, query, budget)
            found = result.tracks
            viaSpotify = result.viaSpotify
        } catch (err: unknown) {
            recordSpotifySearchResult(false)
            logAndSwallow(err, 'candidateFallback.spotifySearch', { query })
            continue
        }
        try {
            const tracks = found
                .filter(
                    (t: Track) =>
                        (!t.durationMS ||
                            t.durationMS <= MAX_AUTOPLAY_DURATION_MS) &&
                        primaryArtistKey(t.author) === currentArtist,
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
                    seedArtistStreak: ctx.seedArtistStreak,
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
                        veto: rec.veto,
                    },
                    auditCollector,
                )
            }
        } catch (err: unknown) {
            logAndSwallow(err, 'candidateFallback.addCandidates', { query })
        }
        // The other engines are slower than Spotify and the whole fallback
        // has a 4s budget: one search for the artist is enough there.
        if (!viaSpotify) break
    }
}

/**
 * One fallback search. Spotify first, as before. While Spotify is
 * 429-blocked or this replenish spent its Spotify budget, search the other
 * engines instead (searchLastFmQuery skips Spotify then): Spotify blocks
 * last hours, and a Spotify-only fallback left autoplay replaying random
 * session history the whole time (2026-11-26).
 */
async function searchFallbackQuery(
    ctx: AutoplayContext,
    query: string,
    budget: SpotifySearchBudget,
): Promise<{ tracks: Track[]; viaSpotify: boolean }> {
    if (!claimSpotifySearch(budget)) {
        const tracks = await searchLastFmQuery(ctx.queue, query, null, budget)
        return { tracks, viaSpotify: false }
    }
    const result = await ctx.queue.player.search(query, {
        requestedBy: undefined,
        searchEngine: QueryType.SPOTIFY_SEARCH,
    })
    // Sample the raw API count: a result whose tracks all exceed the
    // duration cap is a genuine hit, not an outage signal.
    recordSpotifySearchResult(result.tracks.length > 0)
    return { tracks: result.tracks, viaSpotify: true }
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
                    spotifySearchBudgetFor(ctx),
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
