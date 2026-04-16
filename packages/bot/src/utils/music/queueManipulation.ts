import {
    QueryType,
    QueueRepeatMode,
    type Track,
    type GuildQueue,
} from 'discord-player'
import { randomInt } from 'node:crypto'
import type { User } from 'discord.js'
import { LRUCache } from 'lru-cache'
import { debugLog, errorLog, warnLog } from '@lucky/shared/utils'
import { recommendationFeedbackService } from '../../services/musicRecommendation/feedbackService'
import {
    trackHistoryService,
    guildSettingsService,
    lastFmLinkService,
    spotifyLinkService,
} from '@lucky/shared/services'
import {
    getAudioFeatures,
    searchSpotifyTrack,
    getBatchAudioFeatures,
    getArtistPopularity,
    getArtistGenres,
    getSpotifyRecommendations,
    type SpotifyAudioFeatures,
} from '../../spotify/spotifyApi'
import {
    consumeLastFmSeedSlice,
    consumeBlendedSeedSlice,
} from './autoplay/lastFmSeeds'
import { detectSessionMood, type SessionMood } from './autoplay/sessionMood'
import {
    buildExcludedUrls,
    buildExcludedKeys,
    isDuplicateCandidate,
    selectDiverseCandidates,
    addSelectedTracks,
    purgeDuplicatesOfCurrentTrack,
} from './autoplay/diversitySelector'
import { getSimilarTracks, getTagTopTracks } from '../../lastfm'
import {
    cleanSearchQuery,
    cleanTitle,
    cleanAuthor,
    extractSongCore,
} from './searchQueryCleaner'
import { calculateStringSimilarity } from './duplicateDetection/similarityChecker'
import type { QueueMetadata } from '../../types/QueueMetadata'

const AUTOPLAY_BUFFER_SIZE = 8
const HISTORY_SEED_LIMIT = 3
const SEARCH_RESULTS_LIMIT = 8
const MAX_TRACKS_PER_ARTIST = 2
const MAX_TRACKS_PER_SOURCE = 3
const LASTFM_SEED_COUNT = 3
const LASTFM_SCORE_BOOST = 0.0
const MAX_SIMILAR_LOOKUPS = 5
const QUEUE_RESCUE_PROBE_TIMEOUT_MS = Number.parseInt(
    process.env.QUEUE_RESCUE_PROBE_TIMEOUT_MS ?? '5000',
    10,
)
const QUEUE_RESCUE_REFILL_THRESHOLD = Number.parseInt(
    process.env.QUEUE_RESCUE_REFILL_THRESHOLD ?? '3',
    10,
)

interface AudioFeatureEntry {
    value: SpotifyAudioFeatures | null
}

const audioFeatureCache = new LRUCache<string, AudioFeatureEntry>({
    max: 5000,
    ttl: 24 * 60 * 60 * 1000,
})

async function getTrackAudioFeatures(
    track: Track,
    userId: string,
): Promise<SpotifyAudioFeatures | null> {
    const cacheKey = normalizeTrackKey(track.title, track.author)

    const cached = audioFeatureCache.get(cacheKey)
    if (cached !== undefined) {
        debugLog({
            message: 'Audio feature cache hit',
            data: { cacheKey, hasValue: cached.value !== null },
        })
        return cached.value
    }

    debugLog({
        message: 'Audio feature cache miss',
        data: { cacheKey, cacheSize: audioFeatureCache.size },
    })

    const token = await spotifyLinkService.getValidAccessToken(userId)
    if (!token) {
        audioFeatureCache.set(cacheKey, { value: null })
        return null
    }

    let spotifyId: string | null = null

    if (track.url && track.url.includes('open.spotify.com/track/')) {
        const match = track.url.match(/track\/([a-zA-Z0-9]+)/)
        if (match) {
            spotifyId = match[1]
        }
    }

    if (!spotifyId) {
        spotifyId = await searchSpotifyTrack(
            token,
            cleanTitle(track.title ?? ''),
            cleanAuthor(track.author ?? ''),
        )
    }

    if (!spotifyId) {
        audioFeatureCache.set(cacheKey, { value: null })
        return null
    }

    const features = await getAudioFeatures(token, spotifyId).catch(() => null)
    audioFeatureCache.set(cacheKey, { value: features })
    return features
}

type ScoredTrack = {
    track: Track
    score: number
    reason: string
}

export type QueueRescueResult = {
    removedTracks: number
    keptTracks: number
    addedTracks: number
}

export async function clearQueue(queue: GuildQueue): Promise<boolean> {
    try {
        queue.clear()
        debugLog({ message: 'Queue cleared successfully' })
        return true
    } catch (error) {
        errorLog({ message: 'Error clearing queue:', error })
        return false
    }
}

export async function shuffleQueue(queue: GuildQueue): Promise<boolean> {
    try {
        const tracks = queue.tracks.toArray()
        if (tracks.length <= 1) return true

        for (let i = tracks.length - 1; i > 0; i--) {
            const j = randomIndex(i + 1)
            ;[tracks[i], tracks[j]] = [tracks[j], tracks[i]]
        }

        queue.clear()
        for (const track of tracks) {
            queue.addTrack(track)
        }

        debugLog({ message: 'Queue shuffled successfully' })
        return true
    } catch (error) {
        errorLog({ message: 'Error shuffling queue:', error })
        return false
    }
}

export async function smartShuffleQueue(queue: GuildQueue): Promise<boolean> {
    try {
        const tracks = queue.tracks.toArray()
        if (tracks.length <= 1) return true

        const pool = [...tracks]
        const shuffled: Track[] = []
        const initialByUser = new Map<string, number>()
        const placedByUser = new Map<string, number>()

        for (const track of pool) {
            const userId = track.requestedBy?.id ?? 'autoplay'
            initialByUser.set(userId, (initialByUser.get(userId) ?? 0) + 1)
        }

        while (pool.length > 0) {
            const scored = pool.map((track, index) => {
                const userId = track.requestedBy?.id ?? 'autoplay'
                const totalForUser = initialByUser.get(userId) ?? 1
                const placedForUser = placedByUser.get(userId) ?? 0
                const fairnessScore = placedForUser / totalForUser
                return {
                    track,
                    index,
                    score: fairnessScore + randomJitter(0.05),
                }
            })

            scored.sort((a, b) => a.score - b.score)
            const candidateWindow = scored.slice(0, Math.min(3, scored.length))
            const chosen = candidateWindow[randomIndex(candidateWindow.length)]
            if (!chosen) break

            const userId = chosen.track.requestedBy?.id ?? 'autoplay'
            placedByUser.set(userId, (placedByUser.get(userId) ?? 0) + 1)
            shuffled.push(chosen.track)
            pool.splice(chosen.index, 1)
        }

        queue.clear()
        for (const track of shuffled) {
            queue.addTrack(track)
        }

        debugLog({
            message: 'Queue smart-shuffled successfully',
            data: { guildId: queue.guild.id, queueSize: queue.tracks.size },
        })
        return true
    } catch (error) {
        errorLog({ message: 'Error smart-shuffling queue:', error })
        return false
    }
}

export async function removeTrackFromQueue(
    queue: GuildQueue,
    position: number,
): Promise<Track | null> {
    try {
        const tracks = queue.tracks.toArray()
        if (position < 0 || position >= tracks.length) return null

        const track = tracks[position]
        queue.node.remove(track)
        debugLog({
            message: 'Track removed from queue',
            data: { position, track: track.title },
        })
        return track
    } catch (error) {
        errorLog({ message: 'Error removing track from queue:', error })
        return null
    }
}

export async function moveTrackInQueue(
    queue: GuildQueue,
    fromPosition: number,
    toPosition: number,
): Promise<Track | null> {
    try {
        const tracks = queue.tracks.toArray()
        if (
            fromPosition < 0 ||
            fromPosition >= tracks.length ||
            toPosition < 0 ||
            toPosition >= tracks.length
        )
            return null

        const track = tracks[fromPosition]
        queue.node.remove(track)

        const newTracks = queue.tracks.toArray()
        if (toPosition >= newTracks.length) {
            queue.addTrack(track)
        } else {
            queue.insertTrack(track, toPosition)
        }

        debugLog({
            message: 'Track moved in queue',
            data: { track: track.title, from: fromPosition, to: toPosition },
        })
        return track
    } catch (error) {
        errorLog({ message: 'Error moving track in queue:', error })
        return null
    }
}

// Per-guild mutex: serializes concurrent replenishQueue calls so two events
// firing within milliseconds (playerStart + playerFinish) cannot both read
// the same exclusion sets and independently select the same track.
const replenishLocks = new Map<string, Promise<void>>()

// Per-guild counter for query diversity across multiple replenish calls.
const replenishCounters = new Map<string, number>()

export function replenishQueue(
    queue: GuildQueue,
    finishedTrack?: Track,
): Promise<void> {
    const guildId = queue.guild.id
    const prev = replenishLocks.get(guildId) ?? Promise.resolve()
    const next = prev.then(() => _replenishQueue(queue, finishedTrack))
    replenishLocks.set(
        guildId,
        next.catch(() => {}),
    )
    return next
}

async function _replenishQueue(
    queue: GuildQueue,
    finishedTrack?: Track,
): Promise<void> {
    try {
        debugLog({
            message: 'Replenishing queue',
            data: { guildId: queue.guild.id, queueSize: queue.tracks.size },
        })

        const currentTrack = queue.currentTrack ?? finishedTrack ?? null
        if (!currentTrack) return

        purgeDuplicatesOfCurrentTrack(queue, currentTrack)

        const missingTracks = AUTOPLAY_BUFFER_SIZE - queue.tracks.size
        if (missingTracks <= 0) return

        const allHistoryTracks = getAllHistoryTracks(queue)
        const sessionMood = detectSessionMood(allHistoryTracks)
        const historyTracks = allHistoryTracks.slice(0, HISTORY_SEED_LIMIT)
        const seedTracks = [currentTrack, ...historyTracks].slice(
            0,
            HISTORY_SEED_LIMIT + 1,
        )
        const requestedBy = getRequestedBy(queue, currentTrack)
        const metadata = queue.metadata as QueueMetadata | undefined
        const vcMemberIds = metadata?.vcMemberIds ?? []
        const allMemberIds = Array.from(
            new Set([
                ...(requestedBy?.id ? [requestedBy.id] : []),
                ...vcMemberIds,
            ]),
        )

        const [
            likedWeights,
            dislikedWeights,
            persistentHistory,
            guildSettings,
            implicitDislikeKeys,
            implicitLikeKeys,
            allPreferredSets,
            allBlockedSets,
        ] = await Promise.all([
            recommendationFeedbackService.getLikedTrackWeights(
                requestedBy?.id ?? '',
            ),
            recommendationFeedbackService.getDislikedTrackWeights(
                requestedBy?.id ?? '',
            ),
            trackHistoryService.getTrackHistory(queue.guild.id, 150),
            guildSettingsService.getGuildSettings(queue.guild.id),
            recommendationFeedbackService.getImplicitDislikeKeys(
                requestedBy?.id ?? '',
            ),
            recommendationFeedbackService.getImplicitLikeKeys(
                requestedBy?.id ?? '',
            ),
            Promise.all(
                allMemberIds.map((id) =>
                    recommendationFeedbackService.getPreferredArtistKeys(
                        queue.guild.id,
                        id,
                    ),
                ),
            ),
            Promise.all(
                allMemberIds.map((id) =>
                    recommendationFeedbackService.getBlockedArtistKeys(
                        queue.guild.id,
                        id,
                    ),
                ),
            ),
        ])

        const preferredArtistKeys = new Set(
            allPreferredSets.flatMap((s) => [...s]),
        )
        const blockedArtistKeys = new Set(allBlockedSets.flatMap((s) => [...s]))
        const contributionWeights =
            vcMemberIds.length > 1
                ? buildVcContributionWeights(allHistoryTracks, vcMemberIds)
                : new Map<string, number>()
        const autoplayMode = guildSettings?.autoplayMode ?? 'similar'
        if (persistentHistory.length === 0) {
            warnLog({
                message:
                    'Autoplay: persistent history empty — Redis may be unavailable',
                data: { guildId: queue.guild.id },
            })
        }
        const excludedUrls = buildExcludedUrls(
            queue,
            currentTrack,
            allHistoryTracks,
            persistentHistory,
        )
        const excludedKeys = buildExcludedKeys(
            queue,
            currentTrack,
            allHistoryTracks,
            persistentHistory,
        )
        debugLog({
            message: 'Autoplay: exclusion sets built',
            data: {
                guildId: queue.guild.id,
                excludedUrlCount: excludedUrls.size,
                excludedKeyCount: excludedKeys.size,
                queueHistoryTracks: allHistoryTracks.length,
                seedHistoryTracks: historyTracks.length,
                persistentHistory: persistentHistory.length,
            },
        })
        const recentArtists = buildRecentArtists(currentTrack, historyTracks)
        const artistFrequency = buildArtistFrequency(persistentHistory)
        const currentFeatures = requestedBy?.id
            ? await getTrackAudioFeatures(currentTrack, requestedBy.id).catch(
                  () => null,
              )
            : null
        const guildId = queue.guild.id
        const replenishCount = replenishCounters.get(guildId) ?? 0
        const candidates = await collectRecommendationCandidates(
            queue,
            seedTracks,
            requestedBy,
            excludedUrls,
            excludedKeys,
            dislikedWeights,
            likedWeights,
            preferredArtistKeys,
            blockedArtistKeys,
            currentTrack,
            recentArtists,
            replenishCount,
            autoplayMode,
            artistFrequency,
            implicitDislikeKeys,
            implicitLikeKeys,
            sessionMood,
            currentFeatures,
        )
        debugLog({
            message: 'Autoplay: recommendation candidates',
            data: { guildId, count: candidates.size, source: 'recommendation' },
        })

        if (requestedBy?.id) {
            const beforeLastFm = candidates.size
            await collectLastFmCandidates(
                queue,
                requestedBy,
                excludedUrls,
                excludedKeys,
                dislikedWeights,
                likedWeights,
                preferredArtistKeys,
                blockedArtistKeys,
                currentTrack,
                recentArtists,
                candidates,
                autoplayMode,
                artistFrequency,
                implicitDislikeKeys,
                implicitLikeKeys,
                sessionMood,
                contributionWeights,
            )
            debugLog({
                message: 'Autoplay: last.fm candidates',
                data: {
                    guildId,
                    added: candidates.size - beforeLastFm,
                    total: candidates.size,
                    source: 'lastfm',
                },
            })
        }
        if (requestedBy && guildSettings?.autoplayGenres?.length) {
            const beforeGenre = candidates.size
            await collectGenreCandidates(
                queue,
                guildSettings.autoplayGenres,
                requestedBy,
                {
                    candidates,
                    recentArtists,
                    likedTrackKeys: likedWeights,
                    dislikedTrackKeys: dislikedWeights,
                    currentTrack,
                    excludedUrls,
                    excludedKeys,
                    preferredArtistKeys,
                    blockedArtistKeys,
                    autoplayMode,
                    artistFrequency,
                    implicitDislikeKeys,
                    implicitLikeKeys,
                    sessionMood,
                },
            )
            debugLog({
                message: 'Autoplay: genre candidates',
                data: {
                    guildId,
                    added: candidates.size - beforeGenre,
                    total: candidates.size,
                    genres: guildSettings.autoplayGenres,
                    source: 'genre',
                },
            })
        }
        if (candidates.size === 0 && currentTrack) {
            await collectBroadFallbackCandidates(
                queue,
                currentTrack,
                requestedBy,
                excludedUrls,
                excludedKeys,
                dislikedWeights,
                likedWeights,
                preferredArtistKeys,
                blockedArtistKeys,
                recentArtists,
                candidates,
                autoplayMode,
                artistFrequency,
                implicitDislikeKeys,
                implicitLikeKeys,
                sessionMood,
            )
            debugLog({
                message: 'Autoplay: broad fallback candidates',
                data: { guildId, count: candidates.size, source: 'fallback' },
            })
        }

        debugLog({
            message: 'Autoplay: candidate pool ready',
            data: {
                guildId: queue.guild.id,
                candidateCount: candidates.size,
                missingTracks,
                autoplayMode,
                currentTrack: currentTrack.title,
            },
        })

        const seedArtistKey = currentTrack.author.toLowerCase()
        const selected = interleaveByArtist(
            selectDiverseCandidates(
                candidates,
                missingTracks,
                MAX_TRACKS_PER_ARTIST,
                MAX_TRACKS_PER_SOURCE,
                seedArtistKey,
            ),
        )

        const currentAudioFeatures = await getTrackAudioFeatures(
            currentTrack,
            requestedBy?.id ?? '',
        )
        const enriched = await enrichWithAudioFeatures(
            selected,
            requestedBy?.id ?? '',
            currentAudioFeatures,
            currentTrack.author,
        )

        if (
            (autoplayMode === 'discover' || autoplayMode === 'popular') &&
            requestedBy?.id
        ) {
            const token = await Promise.resolve(
                spotifyLinkService.getValidAccessToken(requestedBy.id),
            ).catch(() => null)
            if (token) {
                await Promise.all(
                    enriched.slice(0, 3).map(async (track) => {
                        const popularity = await getArtistPopularity(
                            token,
                            track.track.author,
                        ).catch(() => null)
                        if (popularity === null) return
                        if (autoplayMode === 'popular' && popularity >= 70) {
                            track.score += 0.12
                        } else if (
                            autoplayMode === 'discover' &&
                            popularity <= 40
                        ) {
                            track.score += 0.12
                        }
                    }),
                )
                enriched.sort((a, b) => b.score - a.score)
            }
        }

        if (enriched.length === 0) {
            warnLog({
                message: 'Autoplay: no candidates selected — queue may stall',
                data: {
                    guildId: queue.guild.id,
                    candidatePoolSize: candidates.size,
                },
            })
            replenishCounters.set(guildId, replenishCount + 1)
            return
        }

        debugLog({
            message: 'Autoplay: tracks selected for queue',
            data: {
                guildId: queue.guild.id,
                tracks: enriched.map((s) => ({
                    title: s.track.title,
                    author: s.track.author,
                    score: s.score.toFixed(3),
                    reason: s.reason,
                    url: s.track.url,
                })),
            },
        })

        await addSelectedTracks(
            queue,
            enriched,
            excludedUrls,
            excludedKeys,
            requestedBy?.id,
        )

        // Increment replenish counter for next call's query variation
        replenishCounters.set(guildId, replenishCount + 1)

        debugLog({
            message: 'Autoplay: queue replenished successfully',
            data: {
                guildId: queue.guild.id,
                addedCount: selected.length,
                newQueueSize: queue.tracks.size,
            },
        })
    } catch (error) {
        errorLog({ message: 'Error replenishing queue:', error })
    }
}

function randomIndex(maxExclusive: number): number {
    if (maxExclusive <= 1) return 0
    return randomInt(maxExclusive)
}

function randomJitter(max: number): number {
    if (max <= 0) return 0
    return (randomInt(10_000) / 10_000) * max
}

function getRequestedBy(queue: GuildQueue, currentTrack: Track): User | null {
    const metadata = queue.metadata as QueueMetadata | undefined
    return currentTrack.requestedBy ?? metadata?.requestedBy ?? null
}

function buildRecentArtists(
    currentTrack: Track,
    historyTracks: Track[],
): Set<string> {
    return new Set<string>(
        [currentTrack.author, ...historyTracks.map((track) => track.author)]
            .filter(Boolean)
            .map((artist) => artist.toLowerCase()),
    )
}

function buildArtistFrequency(
    history: { author?: string; isAutoplay?: boolean }[],
): Map<string, number> {
    const freq = new Map<string, number>()
    for (const entry of history) {
        if (!entry.isAutoplay && entry.author) {
            const key = cleanAuthor(entry.author)
                .toLowerCase()
                .replaceAll(/[^a-z0-9]+/g, '')
            if (key) {
                freq.set(key, (freq.get(key) ?? 0) + 1)
            }
        }
    }
    return freq
}

function extractSpotifyTrackId(track: Track): string | null {
    const match =
        track.url?.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/) ??
        track.url?.match(/^spotify:track:([A-Za-z0-9]+)/)
    return match?.[1] ?? null
}

async function collectSpotifyRecommendationCandidates(
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
        upsertScoredCandidate(candidates, track, {
            score: rec.score + 0.3,
            reason: rec.reason ? `${rec.reason} • spotify rec` : 'spotify rec',
        })
    }
}

async function collectRecommendationCandidates(
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
    replenishCount = 0,
    autoplayMode: 'similar' | 'discover' | 'popular' = 'similar',
    artistFrequency: Map<string, number> = new Map(),
    implicitDislikeKeys: Set<string> = new Set(),
    implicitLikeKeys: Set<string> = new Set(),
    sessionMood: SessionMood | null = null,
    currentFeatures: SpotifyAudioFeatures | null = null,
): Promise<Map<string, ScoredTrack>> {
    const candidates = new Map<string, ScoredTrack>()

    await collectSpotifyRecommendationCandidates(
        queue,
        seedTracks,
        requestedBy,
        excludedUrls,
        excludedKeys,
        dislikedWeights,
        likedWeights,
        preferredArtistKeys,
        blockedArtistKeys,
        currentTrack,
        recentArtists,
        candidates,
        autoplayMode,
        artistFrequency,
        implicitDislikeKeys,
        implicitLikeKeys,
        sessionMood,
        currentFeatures,
    )

    for (const seed of seedTracks) {
        const seedCandidates = await searchSeedCandidates(
            queue,
            seed,
            requestedBy,
            replenishCount,
        )
        for (const candidate of seedCandidates) {
            if (
                !shouldIncludeCandidate(candidate, excludedUrls, excludedKeys)
            ) {
                continue
            }
            const normalizedKey = normalizeTrackKey(
                candidate.title,
                candidate.author,
            )
            const dislikedWeight = dislikedWeights.get(normalizedKey)
            if (dislikedWeight !== undefined && dislikedWeight > 0.5) {
                continue
            }
            const rec = calculateRecommendationScore(
                candidate,
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
            if (rec.score !== -Infinity) {
                upsertScoredCandidate(candidates, candidate, rec)
            }
        }
    }

    return candidates
}

const MAX_AUTOPLAY_DURATION_MS = 10 * 60 * 1000
const QUERY_MODIFIERS = ['', 'similar', 'like', 'playlist', 'mix']

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

async function searchSeedCandidates(
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

async function collectBroadFallbackCandidates(
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
): Promise<void> {
    const fallbackQueries = [
        currentTrack.author,
        `${currentTrack.author} popular`,
    ].filter(Boolean)

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
                upsertScoredCandidate(candidates, track, {
                    score: rec.score - 0.1,
                    reason: rec.reason
                        ? `${rec.reason} • artist fallback`
                        : 'artist fallback',
                })
            }

            if (candidates.size > 0) return
        } catch {
            continue
        }
    }
}

function shouldIncludeCandidate(
    track: Track,
    excludedUrls: Set<string>,
    excludedKeys: Set<string>,
): boolean {
    return !isDuplicateCandidate(track, excludedUrls, excludedKeys)
}

function upsertScoredCandidate(
    candidates: Map<string, ScoredTrack>,
    candidate: Track,
    recommendation: { score: number; reason: string },
): void {
    const normalizedKey = normalizeTrackKey(candidate.title, candidate.author)
    const candidateKey =
        normalizedKey !== '::' ? normalizedKey : getTrackKey(candidate)
    const existing = candidates.get(candidateKey)

    if (!existing || recommendation.score > existing.score) {
        candidates.set(candidateKey, {
            track: candidate,
            score: recommendation.score,
            reason: recommendation.reason,
        })
    }
}

async function collectLastFmCandidates(
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

    for (const seed of seedSlice) {
        const query = cleanSearchQuery(seed.title, seed.artist)
        const tracks = await searchLastFmQuery(queue, query, requestedBy)
        for (const track of tracks) {
            if (!shouldIncludeCandidate(track, excludedUrls, excludedKeys))
                continue
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
                true,
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
                    null,
                    true,
                )
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

async function searchLastFmQuery(
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

const GENRE_SCORE_BOOST = 0.1
const MAX_GENRES = 3
const MAX_TRACKS_PER_GENRE = 20

interface CandidateContext {
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
    const rec = calculateRecommendationScore(
        track,
        ctx.currentTrack,
        ctx.recentArtists,
        ctx.likedTrackKeys,
        ctx.preferredArtistKeys,
        ctx.blockedArtistKeys,
        ctx.autoplayMode,
        ctx.artistFrequency,
        ctx.implicitDislikeKeys,
        ctx.implicitLikeKeys,
        ctx.dislikedTrackKeys,
        ctx.sessionMood,
    )
    upsertScoredCandidate(ctx.candidates, track, {
        score: rec.score + GENRE_SCORE_BOOST,
        reason: rec.reason ? `${rec.reason} • ${tag} vibes` : `${tag} vibes`,
    })
}

async function collectGenreCandidates(
    queue: GuildQueue,
    genres: string[],
    requestedBy: User,
    ctx: CandidateContext,
): Promise<void> {
    for (const tag of genres.slice(0, MAX_GENRES)) {
        if (ctx.candidates.size >= AUTOPLAY_BUFFER_SIZE) break
        const seeds = await getTagTopTracks(tag, MAX_TRACKS_PER_GENRE)
        for (const seed of seeds) {
            if (ctx.candidates.size >= AUTOPLAY_BUFFER_SIZE) break
            const results = await searchLastFmQuery(
                queue,
                cleanSearchQuery(seed.title, seed.artist),
                requestedBy,
            )
            for (const track of results) addGenreTrackCandidate(track, tag, ctx)
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
            ).catch(() => [])
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

function interleaveByArtist(tracks: ScoredTrack[]): ScoredTrack[] {
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

function isPlayableTrack(track: Track): boolean {
    return Boolean(track.url) && Boolean(track.title) && Boolean(track.author)
}

async function probeTrackResolvable(
    queue: GuildQueue,
    track: Track,
    timeoutMs: number,
): Promise<boolean> {
    const query = track.url || `${track.title} ${track.author}`.trim()
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    try {
        const result = await Promise.race([
            queue.player.search(query, { searchEngine: QueryType.AUTO }),
            new Promise<null>(
                (resolve) =>
                    (timeoutId = setTimeout(() => resolve(null), timeoutMs)),
            ),
        ])
        return result !== null && result.tracks.length > 0
    } catch {
        return false
    } finally {
        if (timeoutId) {
            clearTimeout(timeoutId)
        }
    }
}

export type RescueQueueOptions = {
    probeResolvable?: boolean
    probeTimeoutMs?: number
    refillThreshold?: number
}

export async function rescueQueue(
    queue: GuildQueue,
    opts: RescueQueueOptions = {},
): Promise<QueueRescueResult> {
    const {
        probeResolvable = false,
        probeTimeoutMs = QUEUE_RESCUE_PROBE_TIMEOUT_MS,
        refillThreshold = QUEUE_RESCUE_REFILL_THRESHOLD,
    } = opts

    try {
        const tracks = queue.tracks.toArray()
        const keptTracks: Track[] = []
        let removedTracks = 0

        for (const track of tracks) {
            if (!isPlayableTrack(track)) {
                removedTracks++
                continue
            }
            if (probeResolvable) {
                const resolvable = await probeTrackResolvable(
                    queue,
                    track,
                    probeTimeoutMs,
                )
                if (!resolvable) {
                    removedTracks++
                    continue
                }
            }
            keptTracks.push(track)
        }

        queue.clear()
        for (const track of keptTracks) {
            queue.addTrack(track)
        }

        const beforeReplenish = queue.tracks.size
        if (queue.currentTrack && queue.tracks.size < refillThreshold) {
            await replenishQueue(queue)
        }
        const addedTracks = Math.max(0, queue.tracks.size - beforeReplenish)

        return {
            removedTracks,
            keptTracks: keptTracks.length,
            addedTracks,
        }
    } catch (error) {
        errorLog({ message: 'Error rescuing queue:', error })
        return {
            removedTracks: 0,
            keptTracks: queue.tracks.size,
            addedTracks: 0,
        }
    }
}

function getAllHistoryTracks(queue: GuildQueue): Track[] {
    const history = queue.history as
        | { tracks?: { toArray?: () => Track[]; data?: Track[] } }
        | undefined

    if (!history?.tracks) return []
    if (typeof history.tracks.toArray === 'function')
        return history.tracks.toArray()
    if (Array.isArray(history.tracks.data)) return history.tracks.data
    return []
}

function getHistoryTracks(queue: GuildQueue): Track[] {
    return getAllHistoryTracks(queue).slice(0, HISTORY_SEED_LIMIT)
}

export function buildVcContributionWeights(
    historyTracks: { requestedBy?: { id?: string } | null }[],
    vcMemberIds: string[],
): Map<string, number> {
    const contributions = new Map<string, number>()

    for (const memberId of vcMemberIds) {
        const count = historyTracks.filter(
            (t) => t.requestedBy?.id === memberId,
        ).length
        contributions.set(memberId, count > 0 ? count : 1)
    }

    const totalWeight = Array.from(contributions.values()).reduce(
        (sum, w) => sum + w,
        0,
    )
    const scaleFactor = vcMemberIds.length / totalWeight

    const weights = new Map<string, number>()
    for (const [memberId, count] of contributions) {
        weights.set(memberId, count * scaleFactor)
    }

    return weights
}

function stripFeaturing(author: string): string {
    const lower = author.toLowerCase()
    for (const kw of [' feat ', ' ft ', ' con ', ' with ']) {
        const idx = lower.indexOf(kw)
        if (idx >= 0) return author.slice(0, idx)
    }
    return author
}

function normalizeTrackKey(title?: string, author?: string): string {
    const cleanedTitle = title ? cleanTitle(title) : ''
    const primaryAuthor = author
        ? stripFeaturing(cleanAuthor(author).split(',')[0] ?? '').trim()
        : ''
    return `${normalizeText(cleanedTitle)}::${normalizeText(primaryAuthor)}`
}

function normalizeTitleOnly(title?: string): string {
    return normalizeText(title ? cleanTitle(title) : '')
}

function normalizeText(value?: string): string {
    return (value ?? '')
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, '')
        .trim()
}

function getTrackKey(track: Track): string {
    return track.id || track.url || normalizeTrackKey(track.title, track.author)
}

const FUZZY_TITLE_THRESHOLD = 0.82

const AMBIENT_NOISE_RE =
    /\b(?:rain sounds?|rain for sleep|ocean waves?|waves? sounds?|nature sounds?|forest sounds?|thunder sounds?|white noise|brown noise|pink noise|asmr|sleep sounds?|sleep music|relaxing rain|ambient sounds?|binaural beats?|solfeggio|healing frequ|528 ?hz|432 ?hz|963 ?hz|chakra healing|spa music|massage music|yoga music|deep sleep|baby sleep|guided meditation|meditation music)\b/i // NOSONAR S5852 — trusted track title from internal API, not user input

const EDM_MIX_RE =
    /\b(?:dj set|festival set|\d+ ?(?:hour|hr) mix|extended mix|club mix|nightclub mix|edm mix|trance mix)\b/i // NOSONAR S5852 — trusted track title from internal API, not user input

const SPANISH_LOCALE_RE =
    /\b(?:reggaeton|reggaet[oó]n|dembow|trap latino|latin trap|cumbia|bachata|merengue|ranchera|corrido|vallenato|banda)\b/i // NOSONAR S5852

const GENRE_FAMILIES = {
    rap_hiphop: ['hip hop', 'rap', 'trap', 'drill', 'gangster rap', 'g-funk'],
    rnb_soul: ['r&b', 'soul', 'neo soul'],
    electronic: [
        'edm',
        'house',
        'techno',
        'trance',
        'dubstep',
        'drum and bass',
        'electro',
        'synthwave',
    ],
    rock_metal: ['rock', 'metal', 'punk', 'grunge', 'alternative'],
    pop: ['pop', 'dance pop', 'latin pop', 'k-pop', 'indie pop'],
    latin: [
        'reggaeton',
        'forró',
        'samba',
        'bossa nova',
        'latin trap',
        'trap latino',
    ],
    country_folk: ['country', 'folk', 'bluegrass'],
    jazz_classical: ['jazz', 'classical', 'orchestral'],
    world: ['afrobeat', 'desi', 'bhangra'],
    ambient_chill: ['lofi', 'chillwave', 'downtempo', 'ambient'],
}

export function getGenreFamilies(genres: string[]): Set<string> {
    const families = new Set<string>()
    const lowerGenres = genres.map((g) => g.toLowerCase())

    for (const [family, keywords] of Object.entries(GENRE_FAMILIES)) {
        for (const keyword of keywords) {
            if (lowerGenres.some((g) => g.includes(keyword))) {
                families.add(family)
                break
            }
        }
    }

    return families
}

export function calculateGenreFamilyPenalty(
    currentGenres: string[],
    candidateGenres: string[],
): number {
    const currentFamilies = getGenreFamilies(currentGenres)
    const candidateFamilies = getGenreFamilies(candidateGenres)

    if (currentFamilies.size === 0 || candidateFamilies.size === 0) {
        return -0.1
    }

    for (const family of currentFamilies) {
        if (candidateFamilies.has(family)) {
            return 0
        }
    }

    const strongGenres = ['rap_hiphop', 'rock_metal', 'latin']
    const isStrongGenre = Array.from(currentFamilies).some((f) =>
        strongGenres.includes(f),
    )

    return isStrongGenre ? -0.6 : -0.3
}

function calculateRecommendationScore(
    candidate: Track,
    currentTrack: Track,
    recentArtists: Set<string>,
    likedWeights: Map<string, number> = new Map(),
    preferredArtistKeys: Set<string> = new Set(),
    blockedArtistKeys: Set<string> = new Set(),
    autoplayMode: 'similar' | 'discover' | 'popular' = 'similar',
    artistFrequency: Map<string, number> = new Map(),
    implicitDislikeKeys: Set<string> = new Set(),
    implicitLikeKeys: Set<string> = new Set(),
    dislikedWeights: Map<string, number> = new Map(),
    sessionMood: SessionMood | null = null,
    skipNoveltyBoost = false,
): { score: number; reason: string } {
    const currentArtist = currentTrack.author.toLowerCase()
    const candidateArtist = candidate.author.toLowerCase()
    const candidateArtistKey = normalizeText(cleanAuthor(candidate.author))

    if (blockedArtistKeys.has(candidateArtistKey)) {
        return { score: -Infinity, reason: 'blocked artist' }
    }

    const MAX_CANDIDATE_DURATION_MS = 15 * 60 * 1000
    if (
        candidate.durationMS &&
        candidate.durationMS > MAX_CANDIDATE_DURATION_MS
    ) {
        return { score: -Infinity, reason: 'track too long' }
    }

    const candidateTitle = candidate.title ?? ''
    if (AMBIENT_NOISE_RE.test(candidateTitle)) {
        return { score: -Infinity, reason: 'ambient/noise content' }
    }
    if (EDM_MIX_RE.test(candidateTitle)) {
        return { score: -Infinity, reason: 'dj mix / edm set' }
    }

    let score = 1
    const reasons: string[] = []

    if (
        sessionMood !== null &&
        sessionMood.dominantLocale === null &&
        SPANISH_LOCALE_RE.test(candidateTitle)
    ) {
        score -= 0.45
        reasons.push('genre mismatch: latin/spanish')
    }

    if (preferredArtistKeys.has(candidateArtistKey)) {
        score += 0.3
        reasons.push('preferred artist')
    }

    const freq = artistFrequency.get(candidateArtistKey) ?? 0
    if (freq >= 5) {
        score += 0.3
        reasons.push('favourite artist')
    } else if (freq >= 3) {
        score += 0.2
        reasons.push('liked artist')
    } else if (freq >= 1) {
        score += 0.1
        reasons.push('known artist')
    }

    const candidateKey = normalizeTrackKey(candidate.title, candidate.author)
    const likedWeight = likedWeights.get(candidateKey)
    if (likedWeight !== undefined) {
        score += 0.3 * likedWeight
        reasons.push('liked track')
    }

    const dislikedWeight = dislikedWeights.get(candidateKey)
    if (dislikedWeight !== undefined) {
        if (dislikedWeight > 0.5) {
            return { score: -Infinity, reason: 'disliked' }
        }
        score -= 0.3 * dislikedWeight
        reasons.push('old dislike')
    }

    if (implicitDislikeKeys.has(candidateKey)) {
        score -= 0.35
        reasons.push('skipped before')
    }
    if (implicitLikeKeys.has(candidateKey)) {
        score += 0.25
        reasons.push('completed before')
    }

    if (candidateArtist === currentArtist) {
        score -= 0.35
        const titleSim = sharedTitleTokenScore(
            candidate.title ?? '',
            currentTrack.title ?? '',
        )
        if (titleSim > 0.4) {
            score += 0.12
            reasons.push('album match')
        }
    } else if (!skipNoveltyBoost && !recentArtists.has(candidateArtist)) {
        score += 0.15
        reasons.push('session novelty')
    }
    if (
        candidate.source === currentTrack.source &&
        candidate.source !== 'spotify'
    ) {
        score -= 0.25
    } else if (candidate.source && candidate.source !== currentTrack.source) {
        reasons.push('source variety')
    }
    const tokenScore = sharedTitleTokenScore(
        candidate.title,
        currentTrack.title,
    )
    score += tokenScore
    if (tokenScore > 0) {
        reasons.push('similar title mood')
    }
    if (
        currentTrack.durationMS &&
        candidate.durationMS &&
        currentTrack.durationMS > 0
    ) {
        const ratio = candidate.durationMS / currentTrack.durationMS
        if (ratio >= 0.8 && ratio <= 1.2) {
            score += 0.15
            reasons.push('similar energy')
        } else if (ratio >= 0.7 && ratio <= 1.3) {
            score += 0.05
        }
    }

    if (candidate.durationMS && candidate.durationMS > 7 * 60 * 1000) {
        score -= 0.2
        reasons.push('long track penalty')
    }

    if (sessionMood) {
        const durationMs = candidate.durationMS ?? 0
        if (
            sessionMood.deepDiveArtist &&
            candidateArtist === sessionMood.deepDiveArtist
        ) {
            score += 0.15
            reasons.push('deep dive')
        }
        if (sessionMood.preferLong && durationMs > 300_000) {
            score += 0.1
            reasons.push('long track match')
        }
        if (sessionMood.preferShort && durationMs > 0 && durationMs < 180_000) {
            score += 0.1
            reasons.push('quick hit match')
        }
        if (sessionMood.restless) {
            if (!recentArtists.has(candidateArtist)) {
                score += 0.1
                reasons.push('restless discovery')
            }
        }
    }

    if (candidate.source === 'spotify') {
        score += 0.4
        reasons.push('spotify preferred')
    }

    if (
        /\b(?:acoustic|live|ao\s{0,3}vivo|ac[uú]stico|cover|karaoke|instrumental)\b/i.test(
            candidate.title ?? '',
        )
    ) {
        score -= 0.2
        reasons.push('version variant')
    }

    if (
        /\b(?:legendad[ao]|traduzido|tradução|legendas?)\b/i.test(
            candidate.title ?? '',
        ) ||
        /\(tributo[^)]*\)/i.test(candidate.title ?? '') ||
        /\(\d{1,2}:\d{2}:\d{2}\)/.test(candidate.title ?? '')
    ) {
        score -= 0.4
        reasons.push('low quality upload')
    }

    if (autoplayMode === 'discover') {
        if (!recentArtists.has(candidateArtist)) {
            score += 0.25
            reasons.push('discovery boost')
        }
        if (recentArtists.has(candidateArtist)) {
            score -= 0.2
        }
    } else if (autoplayMode === 'popular') {
        if (likedWeight !== undefined) {
            score += 0.2 * likedWeight
        }
        if (candidate.durationMS && currentTrack.durationMS) {
            const ratio = candidate.durationMS / currentTrack.durationMS
            if (ratio >= 0.9 && ratio <= 1.1) {
                score += 0.1
                reasons.push('energy match')
            }
        }
    }

    return {
        score,
        reason:
            reasons.length > 0 ? reasons.join(' • ') : 'balanced autoplay pick',
    }
}

function sharedTitleTokenScore(titleA: string, titleB: string): number {
    const tokensA = new Set(splitTokens(titleA))
    const tokensB = splitTokens(titleB)
    if (tokensA.size === 0 || tokensB.length === 0) return 0

    let matches = 0
    for (const token of tokensB) {
        if (tokensA.has(token)) matches++
    }

    return Math.min(0.2, matches * 0.05)
}

function splitTokens(value: string): string[] {
    return value
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length > 2)
}

export function markAsAutoplayTrack(
    track: Track,
    recommendationReason: string,
    requestedById?: string,
): void {
    const descriptor = Object.getOwnPropertyDescriptor(track, 'metadata')

    if (descriptor?.configurable === false) {
        // discord-player seals metadata as a non-configurable property on some
        // track objects — Object.defineProperty would throw `Cannot redefine`.
        // Mutate the object the getter/value returns directly (stable reference).
        const meta = (
            track as unknown as { metadata?: Record<string, unknown> }
        ).metadata
        if (meta && typeof meta === 'object' && !Object.isFrozen(meta)) {
            meta['isAutoplay'] = true
            meta['recommendationReason'] = recommendationReason
            if (requestedById !== undefined)
                meta['requestedById'] = requestedById
        }
        return
    }

    const existingMetadata =
        (track as unknown as { metadata?: Record<string, unknown> }).metadata ??
        {}
    const existingRequestedById =
        typeof existingMetadata.requestedById === 'string'
            ? existingMetadata.requestedById
            : undefined

    Object.defineProperty(track, 'metadata', {
        value: {
            ...existingMetadata,
            isAutoplay: true,
            recommendationReason,
            requestedById: requestedById ?? existingRequestedById,
        },
        writable: true,
        configurable: true,
        enumerable: true,
    })
}

export function moveUserTrackToPriority(queue: GuildQueue, track: Track): void {
    const tracks = queue.tracks.toArray()
    const trackIndex = tracks.findIndex((t) => t.url === track.url)

    if (trackIndex === -1) {
        debugLog({
            message: 'User track not in queue (already playing)',
            data: { title: track.title },
        })
        return
    }

    const firstAutoplayIndex = tracks.findIndex((t) => {
        const meta = (t.metadata ?? {}) as { isAutoplay?: boolean }
        return meta.isAutoplay === true
    })

    if (firstAutoplayIndex === -1 || trackIndex < firstAutoplayIndex) {
        return
    }

    try {
        queue.node.remove(track)
    } catch {
        return
    }

    const remaining = queue.tracks.toArray()
    const newFirstAutoplayIndex = remaining.findIndex((t) => {
        const meta = (t.metadata ?? {}) as { isAutoplay?: boolean }
        return meta.isAutoplay === true
    })

    if (newFirstAutoplayIndex === -1) {
        queue.addTrack(track)
    } else {
        queue.insertTrack(track, newFirstAutoplayIndex)
    }

    debugLog({
        message: 'User track moved to priority position',
        data: {
            title: track.title,
            insertAt:
                newFirstAutoplayIndex === -1 ? 'end' : newFirstAutoplayIndex,
        },
    })
}

export async function blendAutoplayTracks(
    queue: GuildQueue,
    _newSeedTrack: Track,
    blendRatio = 0.5,
): Promise<void> {
    const tracks = queue.tracks.toArray()
    const autoplayTracks = tracks.filter((t) => {
        const meta = (t.metadata ?? {}) as { isAutoplay?: boolean }
        return meta.isAutoplay === true
    })

    if (autoplayTracks.length === 0) return

    const keepCount = Math.ceil(autoplayTracks.length * blendRatio)
    const toRemove = autoplayTracks.slice(keepCount)

    for (const track of toRemove) {
        try {
            queue.node.remove(track)
        } catch {
            // Track may already be removed
        }
    }

    debugLog({
        message: 'Autoplay tracks blended',
        data: {
            kept: keepCount,
            removed: toRemove.length,
        },
    })

    await replenishQueue(queue)
}
