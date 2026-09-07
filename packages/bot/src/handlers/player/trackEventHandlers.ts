import type { Track, GuildQueue } from 'discord-player'
import { QueueRepeatMode } from 'discord-player'
import { infoLog, debugLog, errorLog } from '@lucky/shared/utils'
import { addTrackToHistory } from '../../utils/music/duplicateDetection'
import { replenishQueue } from '../../services/musicManagement/queueOperations'
import { resetAutoplayCount } from '../../utils/music/autoplayManager'
import { featureToggleService } from '@lucky/shared/services'
import { constants } from '@lucky/shared/config'
import { sendNowPlayingEmbed } from './nowPlayingDisplay'
import {
    updateLastFmNowPlaying,
    scrobbleCurrentTrackIfLastFm,
} from './lastfmScrobbler'
import { musicWatchdogService } from '../../services/musicManagement/watchdog'
import { musicSessionSnapshotService } from '../../services/musicRecommendation/sessionSnapshots'
import * as voiceStatus from '../../services/VoiceChannelStatusService'
import {
    scheduleIdleDisconnect,
    clearIdleTimer,
} from '../../services/musicManagement/idleDisconnect'
import { clearVotes } from '../../services/musicManagement/voteSkipStore'
import { recommendationFeedbackService } from '../../services/musicRecommendation/feedbackService'
import { normalizeTrackKey } from '../../services/musicRecommendation/autoplay/scoringUtils'
import {
    isReplenishSuppressed,
    setReplenishSuppressed,
} from '../../services/musicManagement/replenishSuppressionStore'
import { handleQueueExhaustion } from './queueExhaustion'
import { recordRecommendationOutcome } from '../../services/musicRecommendation/recommendationTelemetry'
import {
    getRecentSkipCount,
    isAutoplayTrack,
    isRecommendationAutoplay,
    recordImplicitTrackFeedback,
    logAutoplayOutcomeEval,
    trackStartTimes,
    trackStartKey,
    guildRecentSkipCounts,
    OUTCOME_ACCEPT_PLAY_RATIO,
} from './autoplayOutcomeTracking'

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

function getTrackRequesterId(track: Track): string | undefined {
    const metadata = track.metadata as { requestedById?: string } | undefined
    return track.requestedBy?.id ?? metadata?.requestedById
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
                ).catch((retryErr: unknown) => {
                    // errorLog, not warnLog: this is the second consecutive
                    // failure, so autoplay has stopped for this guild and will
                    // not retry again. warn only adds a Sentry breadcrumb,
                    // which is transmitted solely if some later error fires —
                    // so the moment autoplay died was invisible (#1995).
                    errorLog({
                        message:
                            'Replenish retry failed — autoplay stopped for this guild',
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
        trackStartTimes.set(trackStartKey(queue.guild.id, track.id), Date.now())
        const requestedQuery = (
            track.metadata as { requestedQuery?: string } | null
        )?.requestedQuery
        infoLog({
            message: `Started playing "${track.title}" in ${queue.guild.name}`,
            data: requestedQuery ? { requestedQuery } : undefined,
        })
        debugLog({ message: `Track URL: ${track.url}` })
        if (queue.node.volume !== constants.VOLUME)
            queue.node.setVolume(constants.VOLUME)

        const isAutoplay = isAutoplayTrack(track, client.user?.id)
        if (!isAutoplay) {
            // Explicit new content (e.g. /play) supersedes an earlier
            // /clear's suppression window (#1998) — a suppressed guild only
            // ever starts a non-autoplay track, so this can't clear the
            // flag out from under a real autoplay pick.
            setReplenishSuppressed(queue.guild.id, 0)
        }
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

                    // Guild-scope dislike for autoplay tracks: ensures the signal reaches the
                    // scorer even when requestedBy is null/undefined in the replenisher context.
                    if (isRecommendationAutoplay(track)) {
                        const trackKey = normalizeTrackKey(
                            track.title,
                            track.author,
                        )
                        recommendationFeedbackService.recordGuildImplicitDislike(
                            queue.guild.id,
                            trackKey,
                        )
                    }
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
