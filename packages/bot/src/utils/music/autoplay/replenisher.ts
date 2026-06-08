import type { Track, GuildQueue } from 'discord-player'
import type { User } from 'discord.js'
import { debugLog, errorLog, warnLog } from '@lucky/shared/utils'
import type { AutoplayContext } from './autoplayContext'
import { recommendationFeedbackService } from '../../../services/musicRecommendation/feedbackService'
import {
    trackHistoryService,
    guildSettingsService,
    spotifyLinkService,
    premiumService,
} from '@lucky/shared/services'
import {
    getArtistPopularity,
    getArtistGenres,
} from '../../../spotify/spotifyApi'
import { detectSessionMood, type SessionMood } from './sessionMood'
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
import { getGenreFamilies } from './candidateScorer'
import {
    buildExcludedUrls,
    buildExcludedKeys,
    selectDiverseCandidates,
    addSelectedTracks,
    purgeDuplicatesOfCurrentTrack,
} from './diversitySelector'
import { collectLastFmCandidates } from './lastFmSeeder'
import { collectSeedSimilarCandidates } from './seedSimilarityCollector'
import { serializeBasis } from './recommendationBasis'
import { cleanAuthor } from '../searchQueryCleaner'
import type { QueueMetadata } from '../../../types/QueueMetadata'
import {
    collectBroadFallbackCandidates,
    collectGenreCandidates,
    enrichWithAudioFeatures,
    interleaveByArtist,
} from '../candidateFallback'
import { buildVcContributionWeights } from './vcWeights'
import { getTrackAudioFeatures } from './audioFeatures'
import { evaluateSkipRateBreaker } from './skipCircuitBreaker'

// Autoplay backfill target. Non-premium guilds keep the existing 8-song
// runway; premium guilds get 2× (16) so large listening sessions rarely
// run out of queued tracks between bot cycles. See PremiumService.isPremium.
const AUTOPLAY_BUFFER_SIZE = 8
const AUTOPLAY_BUFFER_SIZE_PREMIUM = 16
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
    let candidatePoolSize = 0
    const sourcesCounts = {
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

        const currentTrack = queue.currentTrack ?? finishedTrack ?? null
        if (!currentTrack) return

        purgeDuplicatesOfCurrentTrack(queue, currentTrack)

        const bufferSize = (await premiumService.isPremium(queue.guild.id))
            ? AUTOPLAY_BUFFER_SIZE_PREMIUM
            : AUTOPLAY_BUFFER_SIZE
        const autoplayInQueue = [...queue.tracks.toArray()].filter(
            (t) =>
                (t.metadata as { isAutoplay?: boolean } | undefined)
                    ?.isAutoplay === true,
        ).length
        const missingTracks = bufferSize - autoplayInQueue
        if (missingTracks <= 0) return

        // Autoplay skip-rate circuit breaker: check if we should pause replenishment
        const shouldContinue = await evaluateSkipRateBreaker(queue)
        if (!shouldContinue) return

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

        // Fetch the token FIRST (it may refresh), then audio features —
        // getTrackAudioFeatures also calls getValidAccessToken(userId)
        // internally, so running them in parallel would race two concurrent
        // token refreshes for the same user. Sequential keeps the refresh
        // single; the second lookup is a cache hit.
        const spotifyToken = requestedBy?.id
            ? await Promise.resolve(
                  spotifyLinkService.getValidAccessToken(requestedBy.id),
              ).catch(() => null)
            : null
        const currentFeatures = requestedBy?.id
            ? await getTrackAudioFeatures(currentTrack, requestedBy.id).catch(
                  () => null,
              )
            : null
        const replenishCount = replenishCounters.get(guildId) ?? 0

        // Tag-driven genre context (Phase 2). One artist-tag cache for the
        // whole pass — every candidate collector reuses it. When Last.fm is not
        // linked the fetcher falls back to Spotify genre strings so the
        // cross-locale veto can still reject Spanish gospel tracks whose
        // title/author carry no Spanish text markers.
        const getArtistTags: ArtistTagFetcher = createArtistTagFetcher(
            spotifyToken
                ? (artist) => getArtistGenres(spotifyToken, artist)
                : undefined,
        )
        // Parallelize tag fetching for current track + genre family detection
        const [currentTrackTags, sessionGenreFamilies] = await Promise.all([
            getArtistTags(currentTrack.author),
            detectSessionGenreFamilies(historyTracks, getArtistTags),
        ])
        const seedIsSertanejo =
            currentTrackTags.length > 0
                ? hasGenreTag(currentTrackTags, SERTANEJO_TAGS)
                : false
        // Block sertanejo candidates unless the seed itself is sertanejo — fail-open
        // when tags are absent (Last.fm unlinked) to avoid over-filtering.
        const blockSertanejo = !seedIsSertanejo

        const candidateGenreContext = {
            getArtistTags,
            currentTrackTags,
            sessionGenreFamilies,
        }
        debugLog({
            message: 'Autoplay: genre context built',
            data: {
                guildId,
                currentTrackTagCount: currentTrackTags.length,
                sessionGenreFamilies: Array.from(sessionGenreFamilies),
                blockSertanejo,
            },
        })
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
            implicitDislikeKeys,
            implicitLikeKeys,
            sessionMood,
            genreContext: candidateGenreContext,
        }
        const candidates = await collectRecommendationCandidates(
            autoplayContext,
            seedTracks,
            requestedBy,
            replenishCount,
            currentFeatures,
            blockSertanejo,
        )
        sourcesCounts.recommendation = candidates.size
        candidatePoolSize = candidates.size
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
                    genreContext: {
                        currentTrackTags,
                        sessionGenreFamilies,
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
        }
        if (candidates.size === 0 && currentTrack) {
            const beforeFallback = candidates.size
            await collectBroadFallbackCandidates(autoplayContext, candidates)
            sourcesCounts.fallback = candidates.size - beforeFallback
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

        const currentAudioFeatures = await getTrackAudioFeatures(
            currentTrack,
            requestedBy?.id ?? '',
        ).catch(() => null)
        const enriched = await enrichWithAudioFeatures(
            selected,
            requestedBy?.id ?? '',
            currentAudioFeatures,
            currentTrack.author,
        )

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

        if (enriched.length === 0) {
            warnLog({
                message: 'Autoplay: no candidates selected — queue may stall',
                data: {
                    guildId: queue.guild.id,
                    candidatePoolSize: candidates.size,
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
                candidatePoolSize,
                durationMs: Date.now() - startTime,
                sources: sourcesCounts,
            },
        })
    } catch (error) {
        errorLog({ message: 'Error replenishing queue:', error })
    }
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
        | { tracks?: { toArray?: () => Track[]; data?: Track[] } }
        | undefined

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
