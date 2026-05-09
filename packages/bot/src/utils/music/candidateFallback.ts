import { QueryType, type Track, type GuildQueue } from 'discord-player'
import type { User } from 'discord.js'
import { debugLog } from '@lucky/shared/utils'
import { getBatchAudioFeatures, getArtistGenres, type SpotifyAudioFeatures } from '../../spotify/spotifyApi'
import { spotifyLinkService } from '@lucky/shared/services'
import { getTagTopTracks } from '../../lastfm'
import { searchLastFmQuery } from './autoplay/lastFmSeeder'
import {
    shouldIncludeCandidate,
    upsertScoredCandidate,
    type ScoredTrack,
} from './autoplay/candidateCollector'
import { calculateRecommendationScore } from './autoplay/candidateScorer'
import type { SessionMood } from './autoplay/sessionMood'
import { createArtistTagFetcher, type ArtistTagFetcher } from './autoplay/artistTagCache'
import type { AutoplayAuditCollector } from './autoplay/autoplayAudit'
import { cleanSearchQuery, cleanAuthor } from './searchQueryCleaner'
import { normalizeTrackKey, calculateGenreFamilyPenalty } from './trackNormalization'

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
    upsertScoredCandidate(ctx.candidates, track, {
        score: rec.score + GENRE_SCORE_BOOST,
        reason: rec.reason ? `${rec.reason} • ${tag} vibes` : `${tag} vibes`,
    }, ctx.auditCollector)
}

export async function collectBroadFallbackCandidates(
    queue: GuildQueue,
    currentTrack: Track,
    requestedBy: User | null,
    excludedUrls: Set<string>,
    excludedKeys: Set<string>,
    dislikedWeights: Map<string, number>,
    likedWeights: Map<string, number>,
    preferredArtistKeys: Set<string>,
    blockedArtistKeys: Set<string>,
    recentArtists: Set<string>,
    candidates: Map<string, ScoredTrack>,
    autoplayMode: 'similar' | 'discover' | 'popular' = 'similar',
    artistFrequency: Map<string, number> = new Map(),
    implicitDislikeKeys: Set<string> = new Set(),
    implicitLikeKeys: Set<string> = new Set(),
    sessionMood: SessionMood | null = null,
    genreContext: {
        getArtistTags?: ArtistTagFetcher
        currentTrackTags?: string[]
        sessionGenreFamilies?: Set<string>
    } = {},
    auditCollector?: AutoplayAuditCollector,
): Promise<void> {
    const getArtistTags = genreContext.getArtistTags ?? createArtistTagFetcher()
    const currentTrackTags = genreContext.currentTrackTags ?? []
    const sessionGenreFamilies = genreContext.sessionGenreFamilies ?? new Set<string>()

    const fallbackQueries = [
        currentTrack.author,
        `${currentTrack.author} popular`,
    ].filter(Boolean)

    // Obtain Spotify token once for the whole fallback pass — used to enrich
    // genre tags when Last.fm is not linked (getArtistTags returns []).
    // Promise.resolve() guards against stubs that return undefined rather than
    // a Promise (matches the pattern used throughout replenisher.ts).
    const spotifyToken = requestedBy?.id // NOSONAR — userId is an internal Discord snowflake, not user-controlled URL data
        ? await Promise.resolve(spotifyLinkService.getValidAccessToken(requestedBy.id)).catch(() => null)
        : null

    for (const query of fallbackQueries) {
        try {
            const result = await queue.player.search(query, {
                requestedBy: requestedBy ?? undefined,
                searchEngine: QueryType.SPOTIFY_SEARCH,
            })

            const tracks = result.tracks
                .filter(
                    (t) =>
                        !t.durationMS ||
                        t.durationMS <= MAX_AUTOPLAY_DURATION_MS,
                )
                .slice(0, SEARCH_RESULTS_LIMIT)

            for (const track of tracks) {
                if (!shouldIncludeCandidate(track, excludedUrls, excludedKeys))
                    continue
                const key = normalizeTrackKey(track.title, track.author)
                const dislikedWeight = dislikedWeights.get(key)
                if (dislikedWeight !== undefined && dislikedWeight > 0.5)
                    continue
                let candidateTags = await getArtistTags(track.author).catch((err: unknown) => {
                    debugLog({ message: 'candidateFallback: getArtistTags failed', data: { author: track.author, err } })
                    return [] as string[]
                })
                // When Last.fm returns nothing (not linked or artist unknown),
                // use Spotify's genre data so the cross-locale Spanish veto in
                // candidateScorer can still fire for Spanish gospel artists
                // that have non-Spanish-looking artist names / titles.
                if (candidateTags.length === 0 && spotifyToken) {
                    candidateTags = await getArtistGenres(spotifyToken, track.author).catch(() => []) // NOSONAR — track.author used as URLSearchParams search query inside getArtistGenres; no raw URL interpolation
                }
                const rec = calculateRecommendationScore({
                    candidate: track,
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
                    genreContext: {
                        candidateTags,
                        currentTrackTags,
                        sessionGenreFamilies,
                    },
                })
                upsertScoredCandidate(candidates, track, {
                    score: rec.score - 0.1,
                    reason: rec.reason
                        ? `${rec.reason} • artist fallback`
                        : 'artist fallback',
                }, auditCollector)
            }

        } catch {
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
        } catch {
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
                for (const track of results) addGenreTrackCandidate(track, tag, ctx)
            } catch {
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
        () => new Map(),
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
                debugLog({ message: 'candidateFallback: getArtistGenres failed', data: { author: track.track.author, err } })
                return []
            })
            const genrePenalty = calculateGenreFamilyPenalty(
                currentGenres,
                candidateGenres,
            )
            if (genrePenalty !== 0) {
                track.score += genrePenalty
                if (genrePenalty < -0.3) {
                    track.reason += ' • genre family drift'
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
                result.push(group[round]!)
                added = true
            }
        }
        round++
    }
    return result
}
