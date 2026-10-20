import type { GuildQueue, Track } from 'discord-player'
import {
    errorLog,
    warnLog,
    debugLog,
    captureException,
} from '@lucky/shared/utils'
import {
    providerFromTrack,
    providerHealthService,
} from '../../services/musicManagement/search/providerHealth'
import {
    toErrorDetails,
    toErrorInstance,
    runSafely,
    logHandlerFailure,
} from './errorClassification'
import { isReportedBridgeExhausted } from './bridgeExhaustedError'
import { classifyYtDlpFailure } from './ytdlpBlockBreaker'
import {
    notifyChannelAutoplayStopped,
    notifyChannelStreamFailed,
} from './streamFailureNotifier'
import { isAutoplayTrack } from './autoplayOutcomeTracking'
import {
    AUTOPLAY_FAILURE_STREAK_LIMIT,
    recordAutoplayStreamFailure,
    resetAutoplayFailureStreak,
} from './autoplayFailureStreak'
import { setReplenishSuppressed } from '../../services/musicManagement/replenishSuppressionStore'
import { settlePlayStartWatch } from './playStartWatch'
import {
    handleYouTubeParserError,
    recoverFromStreamExtractionError,
} from './streamRecovery'
import { analyzeYouTubeError } from '../../services/musicManagement/youtubeErrorHandler'

export type PlayerEvents = {
    events: {
        on: (event: string, handler: Function) => void
    }
    on?: (event: string, handler: Function) => void
}

export const setupErrorHandlers = (player: PlayerEvents): void => {
    player.events.on('error', (queue: GuildQueue, error: Error) => {
        runSafely('Queue error handler failed:', () => {
            const details = toErrorDetails(error)
            errorLog({
                message: `Error in queue ${queue?.guild?.name || 'unknown'}:`,
                error: toErrorInstance(error),
                data: {
                    guildId: queue?.guild?.id ?? 'unknown',
                    guildName: queue?.guild?.name ?? 'unknown',
                    ...details,
                },
            })
            captureException(
                toErrorInstance(error) ?? new Error(details.errorMessage),
                {
                    context: 'player-queue-error',
                    guildId: queue?.guild?.id ?? undefined,
                },
            )

            const isConnectionError =
                details.errorMessage.includes('ECONNRESET') ||
                details.errorMessage.includes('ECONNREFUSED') ||
                details.errorMessage.includes('ETIMEDOUT') ||
                details.errorMessage.includes('Connection reset by peer')

            const connection = queue?.connection
            if (isConnectionError && connection) {
                debugLog({
                    message:
                        'Detected connection error, attempting recovery...',
                })
                runSafely('Failed to recover from connection error:', () => {
                    if (connection.state.status !== 'ready') {
                        connection.rejoin()
                        debugLog({
                            message:
                                'Attempting to recover from connection error',
                        })
                    }
                })
            }
        })
    })

    player.events.on(
        'playerError',
        (queue: GuildQueue, error: Error, track?: Track) => {
            void handlePlayerErrorSafely(queue, error, track)
        },
    )

    player.events.on('debug', (queue: GuildQueue, message: string) => {
        runSafely('Player queue debug handler failed:', () => {
            debugLog({
                message: `Player debug from ${queue?.guild?.name ?? 'unknown'}: ${message}`,
            })
        })
    })

    if (typeof player.on === 'function') {
        player.on('error', (error: Error) => {
            runSafely('Player top-level error handler failed:', () => {
                errorLog({
                    message: 'Unhandled player error:',
                    error: toErrorInstance(error),
                    data: toErrorDetails(error),
                })
                captureException(
                    toErrorInstance(error) ??
                        new Error(toErrorDetails(error).errorMessage),
                    { context: 'player-unhandled-error' },
                )
            })
        })

        player.on('debug', (message: string) => {
            runSafely('Player top-level debug handler failed:', () => {
                debugLog({
                    message: `Player runtime debug: ${message}`,
                })
            })
        })
    }
}

async function handlePlayerErrorSafely(
    queue: GuildQueue,
    error: Error,
    track?: Track,
): Promise<void> {
    try {
        await handlePlayerError(queue, error, track)
    } catch (err) {
        logHandlerFailure('Player error event handler failed:', err)
    }
}

function logPlayerError(
    queue: GuildQueue,
    error: Error,
    alreadyReported: boolean,
): void {
    const params = {
        message: `Player error in queue ${queue.guild.name}:`,
        error: toErrorInstance(error),
        data: {
            guildId: queue.guild.id,
            guildName: queue.guild.name,
            ...toErrorDetails(error),
        },
    }
    if (alreadyReported) {
        warnLog(params)
    } else {
        errorLog(params)
    }
}

// Same choice /clear makes: no refill until a non-autoplay track starts
// (playerStart lifts it), 1h as the ceiling when nothing else plays.
const AUTOPLAY_STOP_SUPPRESSION_MS = 60 * 60 * 1_000

// discord-player has already moved to the next track when it emits
// playerError for a stream failure (GuildQueuePlayerNode #throw dispatches it
// right after the emit), so an autoplay failure needs no recovery and no skip
// here. Runs before the handler's first await, so the clear below lands
// before that dispatch and the queue simply ends.
function handleAutoplayStreamFailure(queue: GuildQueue): void {
    const guildId = queue.guild.id
    const count = recordAutoplayStreamFailure(guildId)
    if (count < AUTOPLAY_FAILURE_STREAK_LIMIT) return

    resetAutoplayFailureStreak(guildId)
    queue.tracks.clear()
    setReplenishSuppressed(guildId, AUTOPLAY_STOP_SUPPRESSION_MS)
    warnLog({
        message: 'Autoplay stopped after consecutive stream failures',
        data: { guildId, failedCount: count },
    })
    void notifyChannelAutoplayStopped(queue, count)
}

/**
 * @param failedTrack the track discord-player failed to stream. Defaults to
 * queue.currentTrack, which after a stream failure still points at the last
 * track that actually played.
 */
export async function handlePlayerError(
    queue: GuildQueue,
    error: Error,
    failedTrack: Track | undefined = queue.currentTrack ?? undefined,
): Promise<void> {
    try {
        const currentTrackProvider = providerFromTrack(failedTrack)
        providerHealthService.recordFailure(
            currentTrackProvider,
            Date.now(),
            error.message,
        )

        const youtubeErrorInfo = analyzeYouTubeError(error)

        if (youtubeErrorInfo.isParserError) {
            handleYouTubeParserError(queue, error, youtubeErrorInfo)
            return
        }

        // The bridge already sent the all-exhausted Sentry event for this
        // play. errorLog forwards its error to Sentry too, so a reported play
        // logs at warn level: skipping only captureException still sent a
        // second NoResultError event on LUCKY-47 for every exhausted play.
        const alreadyReported = isReportedBridgeExhausted(error)
        // Stable fingerprint by yt-dlp failure class so the same root cause
        // stays in one Sentry group across redeploys (#2876). The 'other'
        // class keeps Sentry's default grouping so an unrelated new bug is
        // not merged into an existing issue.
        const failureClass = classifyYtDlpFailure(error)
        const fingerprint =
            failureClass === 'other'
                ? undefined
                : ['player-error', currentTrackProvider, failureClass]
        // errorLog forwards to Sentry without a fingerprint, so a fingerprinted
        // event is captured below and the log line drops to warn level.
        logPlayerError(
            queue,
            error,
            alreadyReported || fingerprint !== undefined,
        )
        if (!alreadyReported) {
            captureException(
                toErrorInstance(error) ?? new Error(String(error)),
                {
                    context: 'player-error',
                    guildId: queue.guild.id,
                    provider: currentTrackProvider,
                    trackUrl: failedTrack?.url,
                },
                fingerprint,
            )
        }

        const isStreamExtractionError =
            error.message.includes('Could not extract stream') ||
            error.message.includes('Streaming data not available') ||
            error.message.includes('chooseFormat') ||
            error.message.includes('Bridge exhausted')

        if (
            isStreamExtractionError &&
            failedTrack &&
            isAutoplayTrack(failedTrack, queue.player?.client?.user?.id)
        ) {
            handleAutoplayStreamFailure(queue)
            return
        }

        if (isStreamExtractionError) {
            debugLog({
                message:
                    'Detected stream extraction error, attempting recovery...',
            })

            try {
                if (failedTrack) {
                    await recoverFromStreamExtractionError(queue, failedTrack)
                } else {
                    queue.node.skip()
                }
            } catch (recoveryError) {
                logHandlerFailure(
                    'Failed to recover from stream extraction error:',
                    recoveryError,
                )
                if (
                    failedTrack &&
                    !settlePlayStartWatch(
                        queue.guild.id,
                        failedTrack,
                        'gave_up',
                    )
                ) {
                    await notifyChannelStreamFailed(queue, failedTrack.title)
                }
                queue.node.skip()
            }
        }
    } catch (handlerError) {
        logHandlerFailure('Error in player error handler:', handlerError)
    }
}
