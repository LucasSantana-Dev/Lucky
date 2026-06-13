import { QueryType, type Track, type GuildQueue } from 'discord-player'
import type { User } from 'discord.js'
import { logAndSwallow } from '@lucky/shared/utils/error'
import { assertDefined } from '@lucky/shared/utils/guards'
import {
    getBatchAudioFeatures,
    getArtistGenres,
    type SpotifyAudioFeatures,
} from '../../spotify/spotifyApi'
import { spotifyLinkService } from '@lucky/shared/services'
import type { AutoplayContext } from './autoplay/autoplayContext'
import { getTagTopTracks } from '../../lastfm'
import { searchLastFmQuery } from './autoplay/lastFmSeeder'
import {
    shouldIncludeCandidate,
    upsertScoredCandidate,
    type ScoredTrack,
} from './autoplay/candidateCollector'
import { calculateRecommendationScore } from './autoplay/candidateScorer'
import type { SessionMood } from './autoplay/sessionMood'
import { createArtistTagFetcher } from './autoplay/artistTagCache'
import type { AutoplayAuditCollector } from './autoplay/autoplayAudit'
import { cleanSearchQuery, cleanAuthor } from './searchQueryCleaner'
import {
    normalizeTrackKey,
    calculateGenreFamilyPenalty,
} from './trackNormalization'

const AUTOPLAY_BUFFER_SIZE = 8
const SEARCH_RESULTS_LIMIT = 8
const MAX_AUTOPLAY_DURATION_MS = 10 * 60 * 1000
const GENRE_SCORE_BOOST = 0.1
const MAX_GENRES = 3
const MAX_TRACKS_PER_GENRE = 20

export interface CandidateContext {
    candidates: Map<string, ScoredTrack>
    recentArtists: Set<string>
    likedTrackKeys: Map<string, number>
    dislikedTrackKeys: Map<string, number>
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
    }
    auditCollector?: AutoplayAuditCollector
}

function addGenreTrackCandidate(
    track: Track,
    tag: string,
    ctx: CandidateContext,
): void {
    if (!shouldIncludeCandidate(track, ctx.excludedUrls, ctx.excludedKeys))
        return
    const key = normalizeTrackKey(track.title, track.author)
    const dislikedWeight = ctx.dislikedTrackKeys.get(key)
    if (dislikedWeight !== undefined && dislikedWeight > 0.5) return
    const rec = calculateRecommendationScore({
        candidate: track,
        currentTrack: ctx.currentTrack,
        recentArtists: ctx.recentArtists,
        likedWeights: ctx.likedTrackKeys,
        preferredArtistKeys: ctx.preferredArtistKeys,
        blockedArtistKeys: ctx.blockedArtistKeys,
        autoplayMode: ctx.autoplayMode,
        artistFrequency: ctx.artistFrequency,
        implicitDislikeKeys: ctx.implicitDislikeKeys,
        implicitLikeKeys: ctx.implicitLikeKeys,
        dislikedWeights: ctx.dislikedTrackKeys,
        sessionMood: ctx.sessionMood,
        genreContext: {
            candidateTags: [tag.toLowerCase()],
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
                for (const track of results)
                    addGenreTrackCandidate(track, tag, ctx)
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

export async function enrichWithAudioFeatures(
    tracks: ScoredTrack[],
    userId: string,
    currentFeatures: SpotifyAudioFeatures | null,
    currentArtistName?: string,
): Promise<ScoredTrack[]> {
    if (!currentFeatures || !userId) return tracks

    const token = await Promise.resolve(
        spotifyLinkService.getValidAccessToken(userId),
    ).catch(() => null)
    if (!token) return tracks

    const spotifyIds: string[] = []
    const idToTrack = new Map<string, ScoredTrack>()

    for (const track of tracks) {
        if (track.track.url?.includes('open.spotify.com/track/')) {
            const match = track.track.url.match(/track\/([a-zA-Z0-9]+)/)
            if (match?.[1]) {
                spotifyIds.push(match[1])
                idToTrack.set(match[1], track)
            }
        }
    }

    if (spotifyIds.length === 0) return tracks

    const features = await getBatchAudioFeatures(token, spotifyIds).catch(
        () => new Map<string, SpotifyAudioFeatures>(),
    )

    let currentGenres: string[] = []
    if (currentArtistName) {
        currentGenres = await getArtistGenres(token, currentArtistName).catch(
            () => [],
        )
    }

    for (const [id, feature] of features) {
        const track = idToTrack.get(id)
        if (!track) continue

        const energyDelta = Math.abs(feature.energy - currentFeatures.energy)
        const valenceDelta = Math.abs(feature.valence - currentFeatures.valence)

        if (energyDelta < 0.15 && valenceDelta < 0.2) {
            track.score += 0.15
        } else if (energyDelta < 0.3 || valenceDelta < 0.35) {
            track.score += 0.07
        } else if (energyDelta > 0.6) {
            track.score -= 0.1
        }

        if (currentGenres.length > 0) {
            const candidateGenres = await getArtistGenres(
                token,
                track.track.author,
            ).catch((err: unknown) => {
                logAndSwallow(err, 'candidateFallback.getArtistGenres', {
                    author: track.track.author,
                })
                return []
            })
            const genrePenalty = calculateGenreFamilyPenalty(
                currentGenres,
                candidateGenres,
            )
            if (genrePenalty !== 0) {
                track.score += genrePenalty
                if (
                    genrePenalty <= -0.3 &&
                    !track.basis.signals.includes('genre family drift')
                ) {
                    track.basis.signals.push('genre family drift')
                }
            }
        }
    }

    return tracks.sort((a, b) => b.score - a.score)
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
                result.push(assertDefined(group[round], 'element present after length check'))
                added = true
            }
        }
        round++
    }
    return result
}
