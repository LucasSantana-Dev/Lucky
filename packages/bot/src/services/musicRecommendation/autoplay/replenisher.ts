import type { Track, GuildQueue } from 'discord-player'
import type { User } from 'discord.js'
import { debugLog, errorLog, warnLog } from '@lucky/shared/utils'
import type { AutoplayContext } from './autoplayContext'
import { recommendationFeedbackService } from '../feedbackService'
import { recordRecommendationOutcome } from '../../../services/musicRecommendation/recommendationTelemetry'
import {
    trackHistoryService,
    guildSettingsService,
    spotifyLinkService,
    premiumService,
    type TrackHistoryEntry,
} from '@lucky/shared/services'
import {
    getArtistPopularity,
    getArtistGenres,
} from '../../../spotify/spotifyApi'
import { detectSessionMood } from './sessionMood'
import {
    collectRecommendationCandidates,
    SERTANEJO_TAGS,
} from './candidateCollector'
import type { SkipStateProvider } from './skipStateProvider'
import {
    createArtistTagFetcher,
    hasGenreTag,
    type ArtistTagFetcher,
} from './artistTagCache'
import { getGenreFamilies, RECENCY_WINDOW_TRACKS } from './candidateScorer'
import {
    buildExcludedUrls,
    buildExcludedKeys,
    selectDiverseCandidates,
    addSelectedTracks,
    purgeDuplicatesOfCurrentTrack,
    type ScoredTrack,
} from './diversitySelector'
import { collectLastFmCandidates } from './lastFmSeeder'
import { collectSeedSimilarCandidates } from './seedSimilarityCollector'
import { serializeBasis } from './recommendationBasis'
import { cleanAuthor } from '../../../utils/music/searchQueryCleaner'
import type { QueueMetadata } from '../../../types/QueueMetadata'
import {
    collectBroadFallbackCandidates,
    collectGenreCandidates,
    interleaveByArtist,
} from '../candidateFallback'
import { buildVcContributionWeights } from './vcWeights'
import { evaluateSkipRateBreaker } from './skipCircuitBreaker'
import { getRejectionCounts } from './candidateContracts'

// Autoplay backfill target. Reduced from 8→2 to prevent over-queueing: when
// too many songs are queued ahead, most get evicted before playerStart without
// recording terminal telemetry events, leaving recommendations stuck pending.
// Queue just-in-time (1-2 songs) so most picks get a chance to emit playerStart
// or playerSkip/playerFinish. Premium guilds get 2× to handle longer sessions.
// See PremiumService.isPremium and issue #1585.
const AUTOPLAY_BUFFER_SIZE = 2
const AUTOPLAY_BUFFER_SIZE_PREMIUM = 4
const HISTORY_SEED_LIMIT = 3
const MAX_TRACKS_PER_ARTIST = 2
const MAX_TRACKS_PER_SOURCE = 3
// 'similar' mode popularity re-rank: a mild gradient (popularity/100 × weight)
// applied POST-selection to the genre-safe candidates, so well-known songs are
// favoured over obscure name-matches without pulling in new (off-genre) tracks.
const SIMILAR_POPULARITY_WEIGHT = 0.12
const POPULARITY_RERANK_HEAD = 5
// Flat boost for the discover/popular mode thresholds.
const POPULARITY_MODE_BOOST = 0.12

/**
 * Post-selection popularity boost for a candidate, by autoplay mode. Applied to
 * already-selected (genre-safe, de-duped) candidates only, so it reorders
 * vetted tracks without introducing new (off-genre) ones.
 * - popular:  flat boost for high-popularity (≥70) artists
 * - discover: flat boost for low-popularity (≤40) artists
 * - similar:  mild gradient favouring well-known artists (tie-breaker)
 */
export function popularityBoost(
    mode: 'similar' | 'discover' | 'popular',
    popularity: number,
): number {
    if (mode === 'popular') return popularity >= 70 ? POPULARITY_MODE_BOOST : 0
    if (mode === 'discover') return popularity <= 40 ? POPULARITY_MODE_BOOST : 0
    return (popularity / 100) * SIMILAR_POPULARITY_WEIGHT
}

// Concurrency lock: prevents duplicate queue insertions when playerStart and
// playerFinish events fire within milliseconds (playerStart + playerFinish) cannot both read
// the same exclusion sets and independently select the same track.
const replenishLocks = new Map<string, Promise<void>>()

// Per-guild counter for query diversity across multiple replenish calls.
const replenishCounters = new Map<string, number>()

// Session mood cache: recomputed only after 3+ new tracks play, preventing
// per-cycle mood flips from transient history changes.
const sessionMoodCache = new Map<
    string,
    { mood: import('./sessionMood').SessionMood; historyLen: number }
>()

/**
 * Mark queued autoplay recommendations that won't be played as "rejected"
 * to prevent them from staying pending forever. Called when:
 * 1. purging duplicate variations of current track
 * 2. replacing an old autoplay cycle with a new one
 *
 * These recommendations never reach playerStart, so they must be explicitly
 * rejected to get accurate telemetry coverage (target: ≥80% terminal events).
 */
async function cancelPendingRecommendations(
    queue: GuildQueue,
    tracksToCancel: Track[],
): Promise<void> {
    if (!tracksToCancel?.length) return

    const cancellationWrites = tracksToCancel.map((track) => {
        const isAutoplay =
            (track.metadata as { isAutoplay?: boolean } | undefined)
                ?.isAutoplay === true
        if (isAutoplay) {
            // Record as 'rejected' since these tracks never got a chance to play
            return recordRecommendationOutcome({
                guildId: queue.guild.id,
                trackId: track.id,
                outcome: 'rejected',
            })
        }
        return Promise.resolve()
    })

    await Promise.all(cancellationWrites).catch((err) => {
        errorLog({
            message: 'Error recording cancelled recommendation outcomes',
            error: err,
        })
    })
}

export function replenishQueue(
    queue: GuildQueue,
    finishedTrack?: Track,
    skipStateProvider?: SkipStateProvider,
): Promise<void> {
    const guildId = queue.guild.id
    const prev = replenishLocks.get(guildId) ?? Promise.resolve()
    const next = prev.then(() =>
        _replenishQueue(queue, finishedTrack, skipStateProvider),
    )
    replenishLocks.set(
        guildId,
        next.catch(() => {}),
    )
    return next
}

async function _replenishQueue(
    queue: GuildQueue,
    finishedTrack?: Track,
    skipStateProvider?: SkipStateProvider,
): Promise<void> {
    const startTime = Date.now()
    const guildId = queue.guild.id
    const sourcesCounts: Record<string, number | { skipped: true }> = {
        recommendation: 0,
        seedSimilar: 0,
        lastfm: 0,
        fallback: 0,
        genre: 0,
    }

    try {
        debugLog({
            message: 'Replenishing queue',
            data: { guildId, queueSize: queue.tracks.size },
        })

        const gatingResult = await evaluateGatingChecks(queue, finishedTrack)
        if (!gatingResult) return
        const { currentTrack, missingTracks } = gatingResult

        const {
            allHistoryTracks,
            sessionMood,
            historyTracks,
            seedTracks,
            requestedBy,
            vcMemberIds,
            allMemberIds,
        } = await extractSeedAndSessionMood(
            queue,
            currentTrack,
            skipStateProvider,
        )
        const {
            likedWeights,
            dislikedWeights,
            persistentHistory,
            guildSettings,
            implicitDislikeKeys: _implicitDislikeKeys,
            implicitLikeKeys,
            mergedImplicitDislikeKeys,
            preferredArtistKeys,
            blockedArtistKeys,
            contributionWeights,
            autoplayMode,
            replayFrequency,
        } = await fetchFeedbackAndHistoryData(
            queue,
            requestedBy,
            vcMemberIds,
            allMemberIds,
            allHistoryTracks,
        )
        const {
            excludedUrls,
            excludedKeys,
            recentArtists,
            recentArtistIndices,
            artistFrequency,
        } = buildExclusionAndDerivedSignals(
            queue,
            currentTrack,
            allHistoryTracks,
            historyTracks,
            persistentHistory,
        )
        // Built once and shared with the collectors below, as before the
        // decomposition: the fetcher carries a per-pass memo cache.
        const getArtistTags = await buildArtistTagFetcher(requestedBy)
        const { currentTrackTags, sessionGenreFamilies, blockSertanejo } =
            await buildGenreTagContext(
                queue,
                currentTrack,
                historyTracks,
                guildSettings,
                getArtistTags,
            )
        const autoplayContext: AutoplayContext = {
            queue,
            excludedUrls,
            excludedKeys,
            dislikedWeights,
            likedWeights,
            preferredArtistKeys,
            blockedArtistKeys,
            currentTrack,
            recentArtists,
            autoplayMode,
            artistFrequency,
            implicitDislikeKeys: mergedImplicitDislikeKeys,
            implicitLikeKeys,
            sessionMood,
            genreContext: {
                getArtistTags,
                currentTrackTags,
                sessionGenreFamilies,
            },
            replayFrequentTrackIds: replayFrequency?.trackIds ?? new Set(),
            replayFrequentArtists: replayFrequency?.artists ?? new Set(),
            recentArtistIndices,
        }

        const { candidates, sourcesCounts: finalSourcesCounts } =
            await collectAllCandidates(
                autoplayContext,
                seedTracks,
                requestedBy,
                blockSertanejo,
                guildSettings,
                contributionWeights,
            )

        debugLog({
            message: 'Autoplay: candidate pool ready',
            data: {
                guildId,
                candidateCount: candidates.size,
                missingTracks,
                autoplayMode,
                currentTrack: currentTrack.title,
            },
        })

        Object.assign(sourcesCounts, finalSourcesCounts)

        const enriched = await selectAndRerankCandidates(
            candidates,
            missingTracks,
            sessionMood,
            currentTrack,
            autoplayMode,
            requestedBy,
        )

        await enqueueAndFinalize(
            autoplayContext,
            enriched,
            candidates,
            requestedBy,
            sourcesCounts,
            startTime,
        )
    } catch (error) {
        errorLog({ message: 'Error replenishing queue:', error })
    }
}

/**
 * Evaluate gating checks: currentTrack presence, purge duplicates, buffer size,
 * skip-rate circuit breaker. Returns {currentTrack, missingTracks} or null.
 */
export async function evaluateGatingChecks(
    queue: GuildQueue,
    finishedTrack?: Track,
): Promise<{ currentTrack: Track; missingTracks: number } | null> {
    const currentTrack = queue.currentTrack ?? finishedTrack ?? null
    if (!currentTrack) return null

    // Record evicted duplicate recommendations as rejected to improve telemetry
    // coverage. These tracks never get a chance to emit playerStart.
    const purgedTracks = purgeDuplicatesOfCurrentTrack(queue, currentTrack)
    await cancelPendingRecommendations(queue, purgedTracks)

    const bufferSize = (await premiumService.isPremium(queue.guild.id))
        ? AUTOPLAY_BUFFER_SIZE_PREMIUM
        : AUTOPLAY_BUFFER_SIZE
    const autoplayInQueue = [...queue.tracks.toArray()].filter(
        (t) =>
            (t.metadata as { isAutoplay?: boolean } | undefined)?.isAutoplay ===
            true,
    ).length
    const missingTracks = bufferSize - autoplayInQueue
    if (missingTracks <= 0) return null

    // Autoplay skip-rate circuit breaker: check if we should pause replenishment
    const shouldContinue = await evaluateSkipRateBreaker(queue)
    if (!shouldContinue) return null

    return { currentTrack, missingTracks }
}

/**
 * Extract seed tracks, session mood, history, and member context.
 */
export async function extractSeedAndSessionMood(
    queue: GuildQueue,
    currentTrack: Track,
    skipStateProvider?: SkipStateProvider,
): Promise<{
    allHistoryTracks: Track[]
    sessionMood: import('./sessionMood').SessionMood
    historyTracks: Track[]
    seedTracks: Track[]
    requestedBy: User | null
    vcMemberIds: string[]
    allMemberIds: string[]
}> {
    const allHistoryTracks = getAllHistoryTracks(queue)
    const replenishGuildId = queue.guild.id
    const guildMoodCache = sessionMoodCache.get(replenishGuildId)
    const sessionMood =
        guildMoodCache &&
        Math.abs(allHistoryTracks.length - guildMoodCache.historyLen) < 3
            ? guildMoodCache.mood
            : (() => {
                  const mood = detectSessionMood(
                      allHistoryTracks,
                      skipStateProvider?.() ?? 0,
                  )
                  sessionMoodCache.set(replenishGuildId, {
                      mood,
                      historyLen: allHistoryTracks.length,
                  })
                  return mood
              })()
    const historyTracks = allHistoryTracks.slice(0, HISTORY_SEED_LIMIT)
    const seedTracks = [currentTrack, ...historyTracks].slice(
        0,
        HISTORY_SEED_LIMIT + 1,
    )
    const requestedBy = getRequestedBy(queue, currentTrack)
    const metadata = queue.metadata as QueueMetadata | undefined
    const vcMemberIds = metadata?.vcMemberIds ?? []
    const allMemberIds = Array.from(
        new Set([...(requestedBy?.id ? [requestedBy.id] : []), ...vcMemberIds]),
    )

    return {
        allHistoryTracks,
        sessionMood,
        historyTracks,
        seedTracks,
        requestedBy,
        vcMemberIds,
        allMemberIds,
    }
}

/**
 * Fetch feedback and history data: liked/disliked weights, persistent history,
 * guild settings, implicit signals, preferred/blocked artists, replay frequency.
 */
export async function fetchFeedbackAndHistoryData(
    queue: GuildQueue,
    requestedBy: User | null,
    vcMemberIds: string[],
    allMemberIds: string[],
    allHistoryTracks: Track[],
): Promise<{
    likedWeights: Map<string, number>
    dislikedWeights: Map<string, number>
    persistentHistory: TrackHistoryEntry[]
    guildSettings: {
        autoplayMode?: 'similar' | 'discover' | 'popular'
        blockSertanejo?: boolean
        autoplayGenres?: string[]
    } | null
    implicitDislikeKeys: Set<string>
    implicitLikeKeys: Set<string>
    mergedImplicitDislikeKeys: Set<string>
    preferredArtistKeys: Set<string>
    blockedArtistKeys: Set<string>
    contributionWeights: Map<string, number>
    autoplayMode: 'similar' | 'discover' | 'popular'
    replayFrequency: { trackIds: Set<string>; artists: Set<string> }
}> {
    const [
        likedWeights,
        dislikedWeights,
        persistentHistory,
        guildSettings,
        implicitDislikeKeys,
        implicitLikeKeys,
        allPreferredSets,
        allBlockedSets,
        replayFrequency,
    ] = await Promise.all([
        recommendationFeedbackService.getLikedTrackWeights(
            queue.guild.id,
            requestedBy?.id ?? '',
        ),
        recommendationFeedbackService.getDislikedTrackWeights(
            queue.guild.id,
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
        // Async wrapper so even a synchronous throw (e.g. method absent on
        // a partial service double) degrades to the empty no-boost result
        (async () => {
            try {
                return await trackHistoryService.getReplayFrequentTracks(
                    queue.guild.id,
                )
            } catch {
                return {
                    trackIds: new Set<string>(),
                    artists: new Set<string>(),
                }
            }
        })(),
    ])

    // Merge guild-scoped implicit dislike keys with user-level keys so skip
    // signals always reach the scorer, even when requestedBy is undefined.
    const guildImplicitDislikeKeys =
        recommendationFeedbackService.getGuildImplicitDislikeKeys(
            queue.guild.id,
        )
    const mergedImplicitDislikeKeys = new Set([
        ...implicitDislikeKeys,
        ...guildImplicitDislikeKeys,
    ])

    const preferredArtistKeys = new Set(allPreferredSets.flatMap((s) => [...s]))
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

    return {
        likedWeights,
        dislikedWeights,
        persistentHistory,
        guildSettings,
        implicitDislikeKeys,
        implicitLikeKeys,
        mergedImplicitDislikeKeys,
        preferredArtistKeys,
        blockedArtistKeys,
        contributionWeights,
        autoplayMode,
        replayFrequency,
    }
}

/**
 * Build exclusion sets and derived signal maps: excludedUrls, excludedKeys,
 * recentArtists, recentArtistIndices, artistFrequency.
 */
export function buildExclusionAndDerivedSignals(
    queue: GuildQueue,
    currentTrack: Track,
    allHistoryTracks: Track[],
    historyTracks: Track[],
    persistentHistory: TrackHistoryEntry[],
): {
    excludedUrls: Set<string>
    excludedKeys: Set<string>
    recentArtists: Set<string>
    recentArtistIndices: Map<string, number>
    artistFrequency: Map<string, number>
} {
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
    // Recency-decay needs the real recent queue, not the 3-track seed sample
    // (HISTORY_SEED_LIMIT) — otherwise the linear-decay window never fills and
    // every recent artist gets a near-max penalty. Feed it the fuller history.
    const recentArtistIndices = buildRecentArtistIndices(
        currentTrack,
        allHistoryTracks,
    )
    const artistFrequency = buildArtistFrequency(persistentHistory)

    return {
        excludedUrls,
        excludedKeys,
        recentArtists,
        recentArtistIndices,
        artistFrequency,
    }
}

/**
 * Helper to build the artist tag fetcher with optional Spotify token.
 */
export async function buildArtistTagFetcher(
    requestedBy: User | null,
): Promise<ArtistTagFetcher> {
    const spotifyToken = requestedBy?.id
        ? await Promise.resolve(
              spotifyLinkService.getValidAccessToken(requestedBy.id),
          ).catch(() => null)
        : null

    return createArtistTagFetcher(
        spotifyToken
            ? (artist) => getArtistGenres(spotifyToken, artist)
            : undefined,
    )
}

/**
 * Build genre/tag context: current track tags, session genre families,
 * sertanejo detection, and block flag.
 */
export async function buildGenreTagContext(
    queue: GuildQueue,
    currentTrack: Track,
    historyTracks: Track[],
    guildSettings: { blockSertanejo?: boolean } | null,
    // Takes the fetcher rather than building its own: createArtistTagFetcher
    // memoizes per instance, so a second one would re-run getValidAccessToken
    // and hand the collectors a cold cache for artists this pass already looked up.
    getArtistTags: ArtistTagFetcher,
): Promise<{
    currentTrackTags: string[]
    sessionGenreFamilies: Set<string>
    blockSertanejo: boolean
}> {
    // Parallelize tag fetching for current track + genre family detection
    const [currentTrackTags, sessionGenreFamilies] = await Promise.all([
        getArtistTags(currentTrack.author),
        detectSessionGenreFamilies(historyTracks, getArtistTags),
    ])

    // Preserve this guard exactly — replenisher.spec.ts:93-95 mocks artistTagCache
    // WITHOUT hasGenreTag and only passes because this guard short-circuits when
    // currentTrackTags.length === 0
    const seedIsSertanejo =
        currentTrackTags.length > 0
            ? hasGenreTag(currentTrackTags, SERTANEJO_TAGS)
            : false
    // Block sertanejo candidates unless the seed itself is sertanejo — fail-open
    // when tags are absent (Last.fm unlinked) to avoid over-filtering.
    // Allow guild to opt-out via blockSertanejo setting (defaults to true).
    const blockSertanejo =
        guildSettings?.blockSertanejo !== false && !seedIsSertanejo

    const guildId = queue.guild.id
    debugLog({
        message: 'Autoplay: genre context built',
        data: {
            guildId,
            currentTrackTagCount: currentTrackTags.length,
            sessionGenreFamilies: Array.from(sessionGenreFamilies),
            blockSertanejo,
        },
    })

    return {
        currentTrackTags,
        sessionGenreFamilies,
        blockSertanejo,
    }
}

/**
 * Collect all autoplay candidates from five sources: recommendation, seed-similar,
 * lastfm, genre, and fallback. Returns candidates set and sourcesCounts breakdown.
 */
export async function collectAllCandidates(
    autoplayContext: AutoplayContext,
    seedTracks: Track[],
    requestedBy: User | null,
    blockSertanejo: boolean,
    guildSettings: { autoplayGenres?: string[] } | null,
    contributionWeights: Map<string, number>,
): Promise<{
    candidates: Map<string, ScoredTrack>
    sourcesCounts: Record<string, number | { skipped: true }>
}> {
    const sourcesCounts: Record<string, number | { skipped: true }> = {
        recommendation: 0,
        seedSimilar: 0,
        lastfm: 0,
        fallback: 0,
        genre: 0,
    }

    const guildId = autoplayContext.queue.guild.id
    const replenishCount = replenishCounters.get(guildId) ?? 0
    const candidates = await collectRecommendationCandidates(
        autoplayContext,
        seedTracks,
        requestedBy,
        replenishCount,
        blockSertanejo,
    )
    sourcesCounts.recommendation = candidates.size
    debugLog({
        message: 'Autoplay: recommendation candidates',
        data: { guildId, count: candidates.size, source: 'recommendation' },
    })

    // Seed-similarity spine: grounds autoplay on the current track's Last.fm
    // similars regardless of whether the user linked Last.fm. Runs before the
    // user-linked Last.fm collector so the pool is anchored to the seed even
    // for unlinked sessions (the common case the drift fix targets).
    if (requestedBy) {
        const beforeSeedSimilar = candidates.size
        await collectSeedSimilarCandidates(
            autoplayContext,
            requestedBy,
            candidates,
        )
        sourcesCounts.seedSimilar = candidates.size - beforeSeedSimilar
        debugLog({
            message: 'Autoplay: seed-similar candidates',
            data: {
                guildId,
                added: candidates.size - beforeSeedSimilar,
                total: candidates.size,
                source: 'seed-similar',
            },
        })
    } else {
        sourcesCounts.seedSimilar = { skipped: true }
    }

    if (requestedBy?.id) {
        const beforeLastFm = candidates.size
        await collectLastFmCandidates(
            autoplayContext,
            requestedBy,
            candidates,
            contributionWeights,
        )
        sourcesCounts.lastfm = candidates.size - beforeLastFm
        debugLog({
            message: 'Autoplay: last.fm candidates',
            data: {
                guildId,
                added: candidates.size - beforeLastFm,
                total: candidates.size,
                source: 'lastfm',
            },
        })
    } else {
        sourcesCounts.lastfm = { skipped: true }
    }

    if (requestedBy && guildSettings?.autoplayGenres?.length) {
        const beforeGenre = candidates.size
        await collectGenreCandidates(
            autoplayContext.queue,
            guildSettings.autoplayGenres,
            requestedBy,
            {
                candidates,
                recentArtists: autoplayContext.recentArtists,
                likedTrackKeys: autoplayContext.likedWeights,
                dislikedTrackKeys: autoplayContext.dislikedWeights,
                currentTrack: autoplayContext.currentTrack,
                excludedUrls: autoplayContext.excludedUrls,
                excludedKeys: autoplayContext.excludedKeys,
                preferredArtistKeys: autoplayContext.preferredArtistKeys,
                blockedArtistKeys: autoplayContext.blockedArtistKeys,
                autoplayMode: autoplayContext.autoplayMode,
                artistFrequency: autoplayContext.artistFrequency,
                implicitDislikeKeys: autoplayContext.implicitDislikeKeys,
                implicitLikeKeys: autoplayContext.implicitLikeKeys,
                sessionMood: autoplayContext.sessionMood,
                genreContext: {
                    currentTrackTags:
                        autoplayContext.genreContext.currentTrackTags,
                    sessionGenreFamilies:
                        autoplayContext.genreContext.sessionGenreFamilies,
                },
            },
        )
        sourcesCounts.genre = candidates.size - beforeGenre
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
    } else {
        sourcesCounts.genre = { skipped: true }
    }

    if (candidates.size === 0 && autoplayContext.currentTrack) {
        const beforeFallback = candidates.size
        await collectBroadFallbackCandidates(autoplayContext, candidates)
        sourcesCounts.fallback = candidates.size - beforeFallback
        debugLog({
            message: 'Autoplay: broad fallback candidates',
            data: { guildId, count: candidates.size, source: 'fallback' },
        })
    }

    return { candidates, sourcesCounts }
}

/**
 * Select diverse candidates and apply popularity re-ranking.
 */
export async function selectAndRerankCandidates(
    candidates: Map<string, ScoredTrack>,
    missingTracks: number,
    sessionMood: import('./sessionMood').SessionMood,
    currentTrack: Track,
    autoplayMode: 'similar' | 'discover' | 'popular',
    requestedBy: User | null,
): Promise<
    {
        track: Track
        score: number
        basis: import('./recommendationBasis').RecommendationBasis
    }[]
> {
    const seedArtistKey = currentTrack.author.toLowerCase()
    // When the user is deep-diving an artist (3+ tracks in last 8), relax
    // the per-artist cap for that artist so autoplay follows their intent.
    const deepDiveKey = sessionMood.deepDiveArtist
    const effectiveMaxPerArtist =
        deepDiveKey && seedArtistKey.includes(deepDiveKey)
            ? 5
            : MAX_TRACKS_PER_ARTIST
    const selected = interleaveByArtist(
        selectDiverseCandidates(
            candidates,
            missingTracks,
            effectiveMaxPerArtist,
            MAX_TRACKS_PER_SOURCE,
            seedArtistKey,
        ),
    )

    const enriched = selected

    if (requestedBy?.id) {
        const token = await Promise.resolve(
            spotifyLinkService.getValidAccessToken(requestedBy.id),
        ).catch(() => null)
        if (token) {
            // Re-rank a bounded head of the already-selected (genre-safe,
            // de-duped) candidates by artist popularity. Post-selection
            // only: it reorders vetted candidates and never introduces new
            // ones, so popularity weighting can't reintroduce off-genre
            // mainstream drift.
            const rerankHead =
                autoplayMode === 'similar' ? POPULARITY_RERANK_HEAD : 3
            await Promise.all(
                enriched.slice(0, rerankHead).map(async (track) => {
                    const popularity = await getArtistPopularity(
                        token,
                        track.track.author,
                    ).catch(() => null)
                    if (popularity === null) return
                    track.score += popularityBoost(autoplayMode, popularity)
                }),
            )
            enriched.sort((a, b) => b.score - a.score)
        }
    }

    return enriched
}

/**
 * Enqueue selected tracks and log finalization, or log empty-result path.
 */
export async function enqueueAndFinalize(
    autoplayContext: AutoplayContext,
    enriched: {
        track: Track
        score: number
        basis: import('./recommendationBasis').RecommendationBasis
    }[],
    candidates: Map<string, ScoredTrack>,
    requestedBy: User | null,
    sourcesCounts: Record<string, number | { skipped: true }>,
    startTime: number,
): Promise<void> {
    const queue = autoplayContext.queue
    const currentTrack = autoplayContext.currentTrack
    const excludedUrls = autoplayContext.excludedUrls
    const excludedKeys = autoplayContext.excludedKeys
    const autoplayMode = autoplayContext.autoplayMode
    const guildId = queue.guild.id
    const replenishCount = replenishCounters.get(guildId) ?? 0

    if (enriched.length === 0) {
        // The per-source breakdown has to ride on this warn, not on the
        // debug below it: production runs LOG_LEVEL=2, so the debug is
        // suppressed and an empty pool was indistinguishable from "which
        // of the five collectors came back dry" (#2146).
        // sources now includes skipped markers and rejected shows
        // how many candidates were vetoed by scoring or deduplication.
        warnLog({
            message: 'Autoplay: no candidates selected — queue may stall',
            data: {
                guildId: queue.guild.id,
                candidatePoolSize: candidates.size,
                sources: sourcesCounts,
                rejected: getRejectionCounts(candidates),
                autoplayMode,
                // Four of the five collectors are gated on a requester, so
                // a zero count means "skipped" rather than "found nothing"
                // when this is false. Without it the breakdown is ambiguous.
                hasRequester: Boolean(requestedBy),
            },
        })
        replenishCounters.set(guildId, replenishCount + 1)
        debugLog({
            message:
                'Autoplay replenish exhausted: all candidate sources returned empty',
            data: {
                guildId,
                currentTrack: currentTrack?.title,
                autoplayMode,
            },
        })
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
                reason: serializeBasis(s.basis),
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
        autoplayMode,
    )

    // Increment replenish counter for next call's query variation
    replenishCounters.set(guildId, replenishCount + 1)

    debugLog({
        message: 'Autoplay pass complete',
        data: {
            guildId,
            tracksAdded: enriched.length,
            newQueueSize: queue.tracks.size,
            // #2147: read the final pool size directly (as the warn path
            // below already does), not a variable assigned once after the
            // first of five collectors.
            candidatePoolSize: candidates.size,
            durationMs: Date.now() - startTime,
            sources: sourcesCounts,
        },
    })
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

/**
 * Build a map of artist names (lowercased) to their queue position (0 = most recent)
 * for recency-decay scoring. Only positions within RECENCY_WINDOW_TRACKS matter —
 * the scorer's decay factor clamps to zero past the window — so iteration stops
 * there, keeping the map bounded regardless of how much history is fetched upstream.
 */
function buildRecentArtistIndices(
    currentTrack: Track,
    historyTracks: Track[],
): Map<string, number> {
    const indices = new Map<string, number>()
    const allTracks = [currentTrack, ...historyTracks]
    const seenArtists = new Set<string>()

    // Iterate from most recent to oldest, assigning each unique artist its
    // most-recent position. Stop at the decay window — later positions score 0.
    const limit = Math.min(allTracks.length, RECENCY_WINDOW_TRACKS)
    for (let i = 0; i < limit; i++) {
        const artist = allTracks[i].author?.toLowerCase()
        if (artist && !seenArtists.has(artist)) {
            indices.set(artist, i)
            seenArtists.add(artist)
        }
    }

    return indices
}

/**
 * Look up Last.fm tags for the most recent unique artists in history and
 * derive the dominant genre families. Returns a non-empty set only when at
 * least 3 of the recent tracks resolve to a single family — this matches
 * `sessionMood`'s "deep dive" threshold and prevents single-track outliers
 * from flipping the cross-genre veto on a genuinely mixed session.
 */
async function detectSessionGenreFamilies(
    historyTracks: { author?: string }[],
    getArtistTags: ArtistTagFetcher,
): Promise<Set<string>> {
    if (historyTracks.length === 0) return new Set()

    const recentArtists = Array.from(
        new Set(
            historyTracks
                .slice(-10)
                .map((t) => t.author?.trim())
                .filter((a): a is string => !!a),
        ),
    ).slice(0, 8)

    if (recentArtists.length === 0) return new Set()

    const artistTagSets = await Promise.all(
        recentArtists.map((artist) => getArtistTags(artist)),
    )

    const familyCounts = new Map<string, number>()
    for (const tags of artistTagSets) {
        if (tags.length === 0) continue
        const families = getGenreFamilies(tags)
        for (const family of families) {
            familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1)
        }
    }

    const dominant = new Set<string>()
    for (const [family, count] of familyCounts) {
        if (count >= 3) dominant.add(family)
    }
    return dominant
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

function getAllHistoryTracks(queue: GuildQueue): Track[] {
    const history = queue.history as
        { tracks?: { toArray?: () => Track[]; data?: Track[] } } | undefined

    if (!history?.tracks) return []
    if (typeof history.tracks.toArray === 'function')
        return history.tracks.toArray()
    if (Array.isArray(history.tracks.data)) return history.tracks.data
    return []
}

export function clearSessionMoodCache(guildId: string): void {
    if (sessionMoodCache.has(guildId)) {
        sessionMoodCache.delete(guildId)
        debugLog({
            message: 'Cleared session mood cache',
            data: { guildId },
        })
    }
}
