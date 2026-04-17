import {
    QueryType,
    type Track,
    type GuildQueue,
} from 'discord-player'
import type { User } from 'discord.js'
import { debugLog, warnLog } from '@lucky/shared/utils'
import { spotifyLinkService } from '@lucky/shared/services'
import {
    searchSpotifyTrack,
    getSpotifyRecommendations,
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
import {
    shouldIncludeCandidate,
    calculateRecommendationScore,
    upsertScoredCandidate,
    normalizeTrackKey,
    normalizeText,
    extractSpotifyTrackId,
} from '../queueManipulation'

const MAX_AUTOPLAY_DURATION_MS = 7 * 60 * 1000
const SEARCH_RESULTS_LIMIT = 8
const QUERY_MODIFIERS = ['', 'similar', 'like', 'playlist', 'mix']

type ScoredTrack = {
    track: Track
    score: number
    reason: string
}

export async function collectSpotifyRecommendationCandidates(
    queue: GuildQueue,
    seedTracks: Track[],
    requestedBy: User | null,
    excludedUrls: Set<string>,
    excludedKeys: Set<string>,
    dislikedWeights: Map<string, number>,
    likedWeights: Map<string, number>,
    preferredArtistKeys: Set<string>,
    blockedArtistKeys: Set<string>,
    currentTrack: Track,
    recentArtists: Set<string>,
    candidates: Map<string, ScoredTrack>,
    autoplayMode: 'similar' | 'discover' | 'popular',
    artistFrequency: Map<string, number>,
    implicitDislikeKeys: Set<string>,
    implicitLikeKeys: Set<string>,
    sessionMood: SessionMood | null,
    currentFeatures: SpotifyAudioFeatures | null,
): Promise<void> {
    if (!requestedBy) return
    const token = await Promise.resolve(
        spotifyLinkService.getValidAccessToken(requestedBy.id),
    ).catch(() => null)
    if (!token) return

    const userSpotifySeeds = await Promise.resolve(
        getUserSpotifySeeds(requestedBy.id),
    ).catch(() => null)

    const seedIds = seedTracks
        .map(extractSpotifyTrackId)
        .filter((id): id is string => id !== null)
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
            return queue.player.search(spotifyUrl, {
                requestedBy: requestedBy ?? undefined,
                searchEngine: QueryType.SPOTIFY_SEARCH,
            })
        }),
    )

    for (const result of searchResults) {
        if (result.status !== 'fulfilled') continue
        const track = result.value.tracks.find(
            (t) => !t.durationMS || t.durationMS <= MAX_AUTOPLAY_DURATION_MS,
        )
        if (!track) continue
        if (!shouldIncludeCandidate(track, excludedUrls, excludedKeys)) continue
        const normalizedKey = normalizeTrackKey(track.title, track.author)
        const dislikedWeight = dislikedWeights.get(normalizedKey)
        if (dislikedWeight !== undefined && dislikedWeight > 0.5) continue
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
        )
        if (rec.score === -Infinity) continue
        let score = rec.score + 0.3
        let reason = rec.reason ? `${rec.reason} • spotify rec` : 'spotify rec'

        if (userSpotifySeeds !== null) {
            const trackArtistLower = track.author.toLowerCase()
            if (userSpotifySeeds.artistNames.has(trackArtistLower)) {
                score += 0.08
                reason += ' • spotify taste'
            }
        }

        upsertScoredCandidate(candidates, track, {
            score,
            reason,
        })
    }
}

export async function searchSeedCandidates(
    queue: GuildQueue,
    seed: Track,
    requestedBy: User | null,
    replenishCount = 0,
): Promise<Track[]> {
    const baseQuery = cleanSearchQuery(seed.title, seed.author)
    const modifier = QUERY_MODIFIERS[replenishCount % QUERY_MODIFIERS.length]
    const query = modifier ? `${baseQuery} ${modifier}` : baseQuery

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

    const engines: QueryType[] = [
        QueryType.SPOTIFY_SEARCH,
        QueryType.YOUTUBE_SEARCH,
        QueryType.AUTO,
    ]

    for (const [idx, engine] of engines.entries()) {
        const engineQuery =
            engine === QueryType.SPOTIFY_SEARCH ? spotifyQuery : query
        try {
            const searchResult = await queue.player.search(engineQuery, {
                requestedBy: requestedBy ?? undefined,
                searchEngine: engine,
            })

            const tracks = searchResult.tracks
                .filter(
                    (t) =>
                        !t.durationMS ||
                        t.durationMS <= MAX_AUTOPLAY_DURATION_MS,
                )
                .slice(0, SEARCH_RESULTS_LIMIT)

            if (tracks.length > 0) {
                if (idx > 0) {
                    warnLog({
                        message:
                            'Autoplay: Spotify returned 0 results, using fallback',
                        data: {
                            fallbackEngine: engine,
                            spotifyQuery,
                            fallbackQuery: engineQuery,
                        },
                    })
                }
                return tracks
            }
            if (engine === QueryType.SPOTIFY_SEARCH) {
                debugLog({
                    message: 'Autoplay: Spotify search returned 0 results',
                    data: { spotifyQuery },
                })
            }
        } catch (error) {
            debugLog({
                message: 'Search failed for seed, trying next engine',
                data: { query: engineQuery, engine, error: String(error) },
            })
        }
    }

    return []
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
