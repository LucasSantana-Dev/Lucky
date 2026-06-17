import type { Track, GuildQueue } from 'discord-player'
import { QueueRepeatMode } from 'discord-player'
import { LRUCache } from 'lru-cache'
import { infoLog, debugLog, errorLog, warnLog } from '@lucky/shared/utils'
import { addTrackToHistory } from '../../utils/music/duplicateDetection'
import { replenishQueue } from '../../utils/music/queueOperations'
import { resetAutoplayCount } from '../../utils/music/autoplayManager'
import { featureToggleService } from '@lucky/shared/services'
import { constants } from '@lucky/shared/config'
import {
    sendNowPlayingEmbed,
    updateLastFmNowPlaying,
    scrobbleCurrentTrackIfLastFm,
} from './trackNowPlaying'
import { musicWatchdogService } from '../../utils/music/watchdog'
import { musicSessionSnapshotService } from '../../utils/music/sessionSnapshots'
import * as voiceStatus from '../../services/VoiceChannelStatusService'
import {
    scheduleIdleDisconnect,
    clearIdleTimer,
} from '../../utils/music/idleDisconnect'
import { clearVotes } from '../../utils/music/voteSkipStore'
import { recommendationFeedbackService } from '../../services/musicRecommendation/feedbackService'
import { cleanTitle, cleanAuthor } from '../../utils/music/searchQueryCleaner'
import { isReplenishSuppressed } from '../../utils/music/replenishSuppressionStore'
import { handleQueueExhaustion } from './queueExhaustion'
import { recordRecommendationOutcome } from '../../services/musicRecommendation/recommendationTelemetry'

const MAX_GUILD_ENTRIES = 500
const TRACK_STATE_TTL_MS = 30 * 60 * 1000

// Autoplay recommendation outcome threshold: a track played past this fraction
// is "accepted"; ended/skipped before it is "rejected" (symmetric across the
// playerFinish + playerSkip paths). Tune via Phase C data.
export const OUTCOME_ACCEPT_PLAY_RATIO = 0.3

export const lastPlayedTracks = new LRUCache<string, Track>({
    max: MAX_GUILD_ENTRIES,
    ttl: TRACK_STATE_TTL_MS,
    updateAgeOnGet: true,
})

// Keyed per TRACK (guildId + track id), not per guild: autoplay track
// lifecycles overlap — discord-player can emit the next track's playerStart
// before the previous track's playerFinish/playerSkip. A single per-guild
// timestamp gets clobbered by that interleaving, making completionRatio ≈ 0
// for the wrong track and corrupting the accept/reject classification (#1275).
const trackStartTimes = new LRUCache<string, number>({
    max: MAX_GUILD_ENTRIES,
    ttl: TRACK_STATE_TTL_MS,
    updateAgeOnGet: true,
})

const trackStartKey = (guildId: string, trackId: string): string =>
    `${guildId}::${trackId}`

const guildRecentSkipCounts = new LRUCache<string, number>({
    max: MAX_GUILD_ENTRIES,
    ttl: TRACK_STATE_TTL_MS,
    updateAgeOnGet: true,
})

export function getRecentSkipCount(guildId: string): number {
    return guildRecentSkipCounts.get(guildId) ?? 0
}

export type TrackHistoryEntry = {
    url: string
    title: string
    author: string
    thumbnail?: string
    timestamp: number
}

export const recentlyPlayedTracks = new LRUCache<string, TrackHistoryEntry[]>({
    max: MAX_GUILD_ENTRIES,
    ttl: TRACK_STATE_TTL_MS,
    updateAgeOnGet: true,
})

function getTrackRequesterId(track: Track): string | undefined {
    const metadata = track.metadata as { requestedById?: string } | undefined
    return track.requestedBy?.id ?? metadata?.requestedById
}

function isAutoplayTrack(track: Track, clientUserId?: string): boolean {
    const metadata = track.metadata as { isAutoplay?: boolean } | undefined
    return (
        metadata?.isAutoplay === true || track.requestedBy?.id === clientUserId
    )
}

function isRecommendationAutoplay(track: Track): boolean {
    const metadata = track.metadata as { isAutoplay?: boolean } | undefined
    return metadata?.isAutoplay === true
}

function normalizeTrackKeyForFeedback(title: string, author: string): string {
    const normalizedTitle = cleanTitle(title)
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, '')
        .trim()
    const normalizedAuthor = cleanAuthor(author)
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, '')
        .trim()
    return `${normalizedTitle}::${normalizedAuthor}`
}

async function recordImplicitTrackFeedback(
    track: Track,
    type: 'implicit_like' | 'implicit_dislike',
): Promise<void> {
    const requesterId =
        track.requestedBy?.id ??
        (track.metadata as { requestedById?: string } | undefined)
            ?.requestedById
    if (!requesterId) return
    const trackKey = normalizeTrackKeyForFeedback(track.title, track.author)
    await recommendationFeedbackService.recordImplicitFeedback(
        requesterId,
        trackKey,
        type,
    )
}

function evictOldEntries(): void {
    for (const [guildId, entries] of recentlyPlayedTracks.entries()) {
        if (entries.length > MAX_GUILD_ENTRIES) {
            recentlyPlayedTracks.set(guildId, entries.slice(-MAX_GUILD_ENTRIES))
        }
    }
}

type PlayerEvents = {
    events: { on: (event: string, handler: Function) => void }
}
type SetupTrackHandlersParams = {
    player: PlayerEvents
    client: { user?: { id: string } | null }
}

export const setupTrackHandlers = ({
    player,
    client,
}: SetupTrackHandlersParams): void => {
    player.events.on('playerStart', async (queue: GuildQueue, track: Track) => {
        clearIdleTimer(queue.guild.id)
        clearVotes(queue.guild.id)
        await handlePlayerStart(queue, track, client)
    })
    player.events.on(
        'playerFinish',
        async (queue: GuildQueue, track: Track) => {
            await handlePlayerFinish(queue, track)
        },
    )
    player.events.on('playerSkip', async (queue: GuildQueue, track: Track) => {
        await handlePlayerSkip(queue, track)
    })
    player.events.on('audioTracksAdd', (queue: GuildQueue, tracks: Track[]) => {
        if (Array.isArray(tracks) && tracks.length > 0) {
            infoLog({
                message: `Added "${tracks[0].title}" to queue in ${queue.guild.name}`,
            })
        }
    })
    player.events.on('emptyQueue', (queue: GuildQueue) => {
        scheduleIdleDisconnect(queue)
    })
}

function handleAutoplayCounter(
    queue: GuildQueue,
    isAutoplay: boolean,
    isAutoplayEnabled: boolean,
): void {
    if (!isAutoplay && !isAutoplayEnabled) {
        resetAutoplayCount(queue.guild.id)
        debugLog({
            message: `Reset autoplay counter for guild ${queue.guild.id} - manual track played and autoplay disabled`,
        })
    } else if (!isAutoplay && isAutoplayEnabled) {
        debugLog({
            message: `Manual track played but autoplay is enabled - keeping autoplay counter for radio experience`,
        })
    }
}

async function handleQueueReplenishment(
    queue: GuildQueue,
    track: Track,
): Promise<void> {
    const autoplayEnabled = await isAutoplayReplenishmentEnabled(
        queue,
        getTrackRequesterId(track),
    )
    if (autoplayEnabled && queue.repeatMode === QueueRepeatMode.AUTOPLAY) {
        try {
            await replenishQueue(queue, undefined, () =>
                getRecentSkipCount(queue.guild.id),
            )
            debugLog({
                message: 'Queue replenished after track start',
                data: {
                    trackTitle: track.title,
                    guildId: queue.guild.id,
                    queueSize: queue.tracks.size,
                },
            })
        } catch (error) {
            errorLog({
                message: 'Replenish failed, retrying in 5s',
                error: String(error),
            })
            setTimeout(() => {
                replenishQueue(queue, undefined, () =>
                    getRecentSkipCount(queue.guild.id),
                ).catch((retryErr) => {
                    warnLog({
                        message: 'Replenish retry failed',
                        error: retryErr,
                        data: { guildId: queue.guild.id },
                    })
                })
            }, 5000)
        }
    } else {
        debugLog({
            message: 'Autoplay feature disabled, skipping queue replenishment',
        })
    }
}

const handlePlayerStart = async (
    queue: GuildQueue,
    track: Track,
    client: { user?: { id: string } | null },
): Promise<void> => {
    try {
        evictOldEntries()
        trackStartTimes.set(trackStartKey(queue.guild.id, track.id), Date.now())
        infoLog({
            message: `Started playing "${track.title}" in ${queue.guild.name}`,
        })
        debugLog({ message: `Track URL: ${track.url}` })
        if (queue.node.volume !== constants.VOLUME)
            queue.node.setVolume(constants.VOLUME)

        const isAutoplay = isAutoplayTrack(track, client.user?.id)
        const isAutoplayEnabled = queue.repeatMode === QueueRepeatMode.AUTOPLAY
        handleAutoplayCounter(queue, isAutoplay, isAutoplayEnabled)
        await handleQueueReplenishment(queue, track)

        try {
            await sendNowPlayingEmbed(queue, track, isAutoplay)
            await updateLastFmNowPlaying(queue, track)
            await voiceStatus.setTrackStatus(queue)
        } catch (error) {
            errorLog({ message: 'Error sending now playing message:', error })
        }

        await musicSessionSnapshotService.saveSnapshot(queue)
        musicWatchdogService.arm(queue)
    } catch (error) {
        errorLog({ message: 'Error in player start handler:', error })
    }
}

async function replenishIfAutoplay(
    queue: GuildQueue,
    finishedTrack?: Track,
): Promise<void> {
    if (isReplenishSuppressed(queue.guild.id)) {
        debugLog({
            message: 'Autoplay replenish suppressed after explicit stop/clear',
            data: { guildId: queue.guild.id },
        })
        return
    }
    const autoplayEnabled = await isAutoplayReplenishmentEnabled(queue)
    if (autoplayEnabled && queue.repeatMode === QueueRepeatMode.AUTOPLAY) {
        await replenishQueue(queue, finishedTrack, () =>
            getRecentSkipCount(queue.guild.id),
        )
    }
}

async function scrobbleAndRecord(
    queue: GuildQueue,
    track?: Track,
): Promise<void> {
    const trackToRecord = track ?? queue.currentTrack
    if (!trackToRecord) return
    await scrobbleCurrentTrackIfLastFm(queue, trackToRecord)
    await addTrackToHistory(trackToRecord, queue.guild.id)
}

// #1275 diagnostic: the per-event accept/reject logic is correct and
// unit-tested (incl. the interleaving probe), yet prod records 0 rejected.
// The existing "Track skipped" log lacks the fields to tell a code issue
// (missing start time, skips routing through playerFinish, the real skipRatio
// distribution) from a genuinely-rare signal (most picks are over-queued and
// never played → 'pending'). Emit the decision inputs for every autoplay
// terminal event, on both paths, so Loki can disambiguate H1 vs H2.
const logAutoplayOutcomeEval = (
    path: 'finish' | 'skip',
    queue: GuildQueue,
    track: Track,
    startTime: number | undefined,
): void => {
    const playedRatio =
        startTime !== undefined && track.durationMS
            ? (Date.now() - startTime) / track.durationMS
            : null
    const recordedOutcome =
        playedRatio === null
            ? 'none(no-timing)'
            : playedRatio < OUTCOME_ACCEPT_PLAY_RATIO
              ? 'rejected'
              : path === 'finish'
                ? 'accepted'
                : 'ambiguous(dropped)'
    infoLog({
        message: 'Autoplay outcome eval',
        data: {
            path,
            guildId: queue.guild.id,
            trackId: track.id,
            hasStartTime: startTime !== undefined,
            durationMS: track.durationMS ?? null,
            playedRatio:
                playedRatio === null
                    ? null
                    : Math.round(playedRatio * 1000) / 1000,
            recordedOutcome,
        },
    })
}

const handlePlayerFinish = async (
    queue: GuildQueue,
    track?: Track,
): Promise<void> => {
    try {
        await scrobbleAndRecord(queue, track)

        if (track) {
            const startTime = trackStartTimes.get(
                trackStartKey(queue.guild.id, track.id),
            )
            if (isRecommendationAutoplay(track)) {
                logAutoplayOutcomeEval('finish', queue, track, startTime)
            }
            if (startTime && track.durationMS) {
                const completionRatio =
                    (Date.now() - startTime) / track.durationMS
                if (completionRatio > 0.8) {
                    await recordImplicitTrackFeedback(track, 'implicit_like')
                    guildRecentSkipCounts.delete(queue.guild.id)
                }
                // Record the autoplay recommendation outcome. playerFinish fires
                // for BOTH a natural end (high completion) and an early
                // termination — including manual skips that route through
                // 'playerFinish' rather than 'playerSkip' in discord-player v7.
                // Classify by completion (mirror of the skip path): >30% played
                // = accepted, ≤30% = rejected. Previously a ≤30% finish recorded
                // nothing, so real skips were lost as 'pending' (issue #1275).
                if (isRecommendationAutoplay(track)) {
                    await recordRecommendationOutcome({
                        guildId: queue.guild.id,
                        trackId: track.id,
                        // < threshold = rejected (same condition as the skip
                        // path, so the 30% boundary classifies identically).
                        outcome:
                            completionRatio < OUTCOME_ACCEPT_PLAY_RATIO
                                ? 'rejected'
                                : 'accepted',
                    })
                }
            }
            trackStartTimes.delete(trackStartKey(queue.guild.id, track.id))
        }

        await handleQueueExhaustion(queue, (q, t) =>
            replenishIfAutoplay(q, t ?? track),
        )
    } catch (error) {
        errorLog({ message: 'Error in playerFinish event:', error })
    }
}

const handlePlayerSkip = async (
    queue: GuildQueue,
    track?: Track,
): Promise<void> => {
    try {
        infoLog({
            message: 'Track skipped',
            data: {
                guildId: queue.guild.id,
                skippedTrack: track?.title ?? 'unknown',
                skippedUrl: track?.url ?? '',
                queueSizeAfter: queue.tracks.size,
                currentTrack: queue.currentTrack?.title ?? 'none',
            },
        })
        if (track) {
            await addTrackToHistory(track, queue.guild.id)
        }
        await scrobbleCurrentTrackIfLastFm(queue, track)

        if (track) {
            const startTime = trackStartTimes.get(
                trackStartKey(queue.guild.id, track.id),
            )
            if (isRecommendationAutoplay(track)) {
                logAutoplayOutcomeEval('skip', queue, track, startTime)
            }
            if (startTime && track.durationMS) {
                const skipRatio = (Date.now() - startTime) / track.durationMS
                // Implicit-dislike noise filter: only for tracks long enough that
                // an early-skip ratio is meaningful (>20s).
                if (
                    track.durationMS > 20_000 &&
                    skipRatio < OUTCOME_ACCEPT_PLAY_RATIO
                ) {
                    await recordImplicitTrackFeedback(track, 'implicit_dislike')
                    const current =
                        guildRecentSkipCounts.get(queue.guild.id) ?? 0
                    guildRecentSkipCounts.set(queue.guild.id, current + 1)
                }
                // Record the autoplay recommendation outcome on skip — duration-
                // agnostic, consistent with the playerFinish path: a skip before
                // 30% played is a rejection (mirror of the accept threshold).
                // Skips after 30% are ambiguous (a meaningful chunk was heard)
                // and left unrecorded. Previously only sub-5s skips counted, so
                // the common "heard ~15s, wrong, skip" rejection was lost (#1275).
                if (
                    isRecommendationAutoplay(track) &&
                    skipRatio < OUTCOME_ACCEPT_PLAY_RATIO
                ) {
                    await recordRecommendationOutcome({
                        guildId: queue.guild.id,
                        trackId: track.id,
                        outcome: 'rejected',
                    })
                }
            }
            trackStartTimes.delete(trackStartKey(queue.guild.id, track.id))
        }

        await handleQueueExhaustion(queue, (q, t) =>
            replenishIfAutoplay(q, t ?? track),
        )
    } catch (error) {
        errorLog({ message: 'Error in playerSkip event:', error })
    }
}

async function isAutoplayReplenishmentEnabled(
    queue: GuildQueue,
    userId?: string,
): Promise<boolean> {
    return featureToggleService.isEnabled('AUTOPLAY', {
        guildId: queue.guild.id,
        userId,
    })
}
