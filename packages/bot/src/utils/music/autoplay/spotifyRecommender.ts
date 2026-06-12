import { QueryType, type Track, type GuildQueue } from 'discord-player'
import type { User } from 'discord.js'
import { debugLog } from '@lucky/shared/utils'
import { logAndSwallow } from '@lucky/shared/utils/error'
import { spotifyLinkService } from '@lucky/shared/services'
import {
    searchSpotifyTrack,
    getSpotifyRecommendations,
    getArtistGenres,
    type SpotifyAudioFeatures,
} from '../../../spotify/spotifyApi'
import { getUserSpotifySeeds } from '../../../spotify/spotifyUserSeeds'
import {
    cleanTitle,
    cleanAuthor,
    extractSongCore,
    cleanSearchQuery,
} from '../searchQueryCleaner'
import type { SessionMood } from './sessionMood'
import type { AutoplayContext } from './autoplayContext'
import {
    normalizeTrackKey,
    normalizeText,
    extractSpotifyTrackId,
} from './scoringUtils'
import {
    shouldIncludeCandidate,
    upsertScoredCandidate,
} from './candidateContracts'
import { calculateRecommendationScore } from './candidateScorer'
import { createArtistTagFetcher, type ArtistTagFetcher } from './artistTagCache'
import type { ScoredTrack } from './diversitySelector'
import type { AutoplayAuditCollector } from './autoplayAudit'

const MAX_AUTOPLAY_DURATION_MS = 7 * 60 * 1000
const SEARCH_RESULTS_LIMIT = 8

export async function collectSpotifyRecommendationCandidates(
    ctx: AutoplayContext,
    seedTracks: Track[],
    requestedBy: User | null,
    candidates: Map<string, ScoredTrack>,
    currentFeatures: SpotifyAudioFeatures | null,
    auditCollector?: AutoplayAuditCollector,
): Promise<void> {
    const getArtistTags =
        ctx.genreContext.getArtistTags ?? createArtistTagFetcher()
    const currentTrackTags = ctx.genreContext.currentTrackTags ?? []
    const sessionGenreFamilies =
        ctx.genreContext.sessionGenreFamilies ?? new Set<string>()
    if (!requestedBy) return
    const token = await Promise.resolve(
        spotifyLinkService.getValidAccessToken(requestedBy.id),
    ).catch(() => null)
    if (!token) return

    const userSpotifySeeds = await Promise.resolve(
        getUserSpotifySeeds(requestedBy.id),
    ).catch(() => null)

    const likedSeedIds = userSpotifySeeds?.likedTrackIds?.slice(0, 3) ?? []
    const queueSeedIds = seedTracks
        .map(extractSpotifyTrackId)
        .filter((id): id is string => id !== null)
    // Liked tracks take priority; fill remaining slots from queue history (max 5 total per Spotify API limit)
    const seedIds = [...likedSeedIds, ...queueSeedIds]
        .filter((id, i, arr) => arr.indexOf(id) === i)
        .slice(0, 5)

    if (seedIds.length === 0) {
        const resolved = await Promise.allSettled(
            seedTracks.slice(0, 3).map((s) => {
                const core = extractSongCore(s.title ?? '', s.author)
                return searchSpotifyTrack(
                    token,
                    core ?? cleanTitle(s.title ?? ''),
                    cleanAuthor(s.author),
                )
            }),
        )
        resolved.forEach((r) => {
            if (r.status === 'fulfilled' && r.value) seedIds.push(r.value)
        })
    }

    if (seedIds.length === 0) return
    const audioConstraints = currentFeatures
        ? {
              energy: currentFeatures.energy,
              valence: currentFeatures.valence,
              danceability: currentFeatures.danceability,
          }
        : undefined
    const recs = await getSpotifyRecommendations(
        token,
        seedIds,
        15,
        audioConstraints,
    )
    if (recs.length === 0) return

    debugLog({
        message: 'Autoplay: Spotify recommendations fetched',
        data: { count: recs.length, seedCount: seedIds.length },
    })

    const searchResults = await Promise.allSettled(
        recs.map((rec) => {
            const spotifyUrl = `https://open.spotify.com/track/${rec.id}`
            return ctx.queue.player.search(spotifyUrl, {
                requestedBy: requestedBy ?? undefined,
                searchEngine: QueryType.SPOTIFY_SEARCH,
            })
        }),
    )

    for (const result of searchResults) {
        if (result.status !== 'fulfilled') continue
        const track = result.value.tracks.find(
            (t: Track) =>
                !t.durationMS || t.durationMS <= MAX_AUTOPLAY_DURATION_MS,
        )
        if (!track) continue
        if (!shouldIncludeCandidate(track, ctx.excludedUrls, ctx.excludedKeys))
            continue
        const normalizedKey = normalizeTrackKey(track.title, track.author)
        const dislikedWeight = ctx.dislikedWeights.get(normalizedKey)
        if (dislikedWeight !== undefined && dislikedWeight > 0.5) continue
        const lastFmTags = await getArtistTags(track.author)
        // When Last.fm is not linked, fall back to Spotify genres so the
        // cross-locale veto can still catch Spanish gospel tracks whose
        // title/artist name has no Spanish text markers.
        const tags =
            lastFmTags.length > 0
                ? lastFmTags
                : await getArtistGenres(token, track.author).catch((err) => {
                      logAndSwallow(err, 'spotifyRecommender:getArtistGenres', {
                          trackAuthor: track.author,
                      })
                      return [] as string[]
                  })
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
                candidateTags: tags,
                currentTrackTags,
                sessionGenreFamilies,
            },
        })
        let score = rec.score + 0.3
        let source: 'spotify-rec' | 'spotify-taste' = 'spotify-rec'
        const signals = rec.signals

        if (userSpotifySeeds !== null) {
            const trackArtistLower = track.author.toLowerCase()
            if (userSpotifySeeds.artistNames.has(trackArtistLower)) {
                score += 0.08
                source = 'spotify-taste'
            }
        }

        upsertScoredCandidate(
            candidates,
            track,
            {
                score,
                source,
                signals,
            },
            auditCollector,
        )
    }
}

export async function searchSeedCandidates(
    queue: GuildQueue,
    seed: Track,
    requestedBy: User | null,
): Promise<Track[]> {
    const baseQuery = cleanSearchQuery(seed.title, seed.author)

    const cleanedTitle = cleanTitle(seed.title)
    const cleanedAuthor = cleanAuthor(seed.author)
    const authorNorm = normalizeText(cleanedAuthor)
    const authorInTitle =
        authorNorm.length >= 3 &&
        normalizeText(cleanedTitle).includes(
            authorNorm.slice(0, Math.min(5, authorNorm.length)),
        )

    let spotifyBase: string
    if (authorInTitle) {
        spotifyBase = cleanedTitle
    } else {
        const songCore = extractSongCore(seed.title, seed.author)
        if (songCore) {
            const titleArtist = extractTitleArtistFromSong(
                cleanedTitle,
                songCore,
            )
            spotifyBase = `${songCore} ${titleArtist ?? cleanedAuthor}`.trim()
        } else {
            spotifyBase = baseQuery
        }
    }
    const spotifyQuery = spotifyBase

    try {
        const searchResult = await queue.player.search(spotifyQuery, {
            requestedBy: requestedBy ?? undefined,
            searchEngine: QueryType.SPOTIFY_SEARCH,
        })

        const tracks = searchResult.tracks
            .filter(
                (t) =>
                    !t.durationMS || t.durationMS <= MAX_AUTOPLAY_DURATION_MS,
            )
            .slice(0, SEARCH_RESULTS_LIMIT)

        if (tracks.length === 0) {
            debugLog({
                message: 'Autoplay: seed search returned 0 results',
                data: { spotifyQuery },
            })
        }

        return tracks
    } catch (error) {
        debugLog({
            message: 'Autoplay: seed search failed',
            data: { spotifyQuery, error: String(error) },
        })
        return []
    }
}

function extractTitleArtistFromSong(
    cleanedTitle: string,
    songCore: string,
): string | null {
    const normCore = normalizeText(songCore)
    const corePrefix = normCore.slice(0, Math.min(6, normCore.length))
    for (const sep of [' - ', ' – ', ' — ']) {
        const idx = cleanedTitle.indexOf(sep)
        if (idx < 2 || idx > 60) continue
        const left = cleanedTitle.slice(0, idx).trim()
        if (/[()[\]]/.test(left) || left.length < 2) continue
        const right = cleanedTitle.slice(idx + sep.length).trim()
        if (
            corePrefix.length >= 3 &&
            normalizeText(left).startsWith(corePrefix)
        ) {
            return right
        }
        return left
    }
    return null
}
