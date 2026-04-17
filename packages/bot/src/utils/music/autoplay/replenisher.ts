import type { Track, GuildQueue } from 'discord-player'
import type { User } from 'discord.js'
import { debugLog, errorLog, warnLog } from '@lucky/shared/utils'
import { recommendationFeedbackService } from '../../../services/musicRecommendation/feedbackService'
import {
    trackHistoryService,
    guildSettingsService,
    spotifyLinkService,
} from '@lucky/shared/services'
import {
    getArtistPopularity,
} from '../../../spotify/spotifyApi'
import { detectSessionMood, type SessionMood } from './sessionMood'
import {
    collectRecommendationCandidates,
} from './candidateCollector'
import {
    buildExcludedUrls,
    buildExcludedKeys,
    selectDiverseCandidates,
    addSelectedTracks,
    purgeDuplicatesOfCurrentTrack,
} from './diversitySelector'
import { collectLastFmCandidates } from './lastFmSeeder'
import { cleanAuthor } from '../searchQueryCleaner'
import type { QueueMetadata } from '../../../types/QueueMetadata'
import {
    collectBroadFallbackCandidates,
    collectGenreCandidates,
    enrichWithAudioFeatures,
    getTrackAudioFeatures,
    interleaveByArtist,
    buildVcContributionWeights,
} from '../queueManipulation'

const AUTOPLAY_BUFFER_SIZE = 8
const HISTORY_SEED_LIMIT = 3
const MAX_TRACKS_PER_ARTIST = 2
const MAX_TRACKS_PER_SOURCE = 3

// Concurrency lock: prevents duplicate queue insertions when playerStart and
// playerFinish events fire within milliseconds (playerStart + playerFinish) cannot both read
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
