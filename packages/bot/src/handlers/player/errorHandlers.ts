import { QueryType, type GuildQueue } from 'discord-player'
import type { TextChannel, User } from 'discord.js'
import { errorLog, debugLog, warnLog } from '@lucky/shared/utils'
import { createErrorEmbed } from '../../utils/general/embeds'
import {
    analyzeYouTubeError,
    logYouTubeError,
} from '../../utils/music/youtubeErrorHandler'
import { youtubeConfig } from '@lucky/shared/config'
import {
    providerFromTrack,
    providerHealthService,
} from '../../utils/music/search/providerHealth'

type PlayerEvents = {
    events: {
        on: (event: string, handler: Function) => void
    }
    on?: (event: string, handler: Function) => void
}

interface IQueueMetadata {
    requestedBy?: User | null
    channel?: TextChannel | null
}

async function notifyChannelStreamFailed(
    queue: GuildQueue,
    trackTitle: string,
): Promise<void> {
    const channel = (queue.metadata as IQueueMetadata)?.channel
    if (!channel) return
    try {
        await channel.send({
            embeds: [
                createErrorEmbed(
                    '⚠️ Could not play track',
                    `**${trackTitle}** could not be streamed from any source. It may be unavailable in your region or not on SoundCloud. Skipping to next track.`,
                ),
            ],
        })
    } catch {
        // non-critical — don't crash if we can't notify
    }
}

function toErrorDetails(error: unknown): {
    errorMessage: string
    errorStack?: string
    errorName?: string
} {
    if (error instanceof Error) {
        return {
            errorMessage: error.message,
            errorStack: error.stack,
            errorName: error.name,
        }
    }

    return {
        errorMessage: String(error),
        errorName: typeof error,
    }
}

function toErrorInstance(error: unknown): Error | undefined {
    return error instanceof Error ? error : undefined
}

function safeErrorLog(payload: {
    message: string
    error?: Error
    data?: Record<string, unknown>
}): void {
    try {
        errorLog(payload)
    } catch (error) {
        debugLog({ message: 'errorHandlers: errorLog failed', error })
    }
}

function logHandlerFailure(message: string, error: unknown): void {
    safeErrorLog({
        message,
        error: toErrorInstance(error),
        data: toErrorDetails(error),
    })
}

function runSafely(message: string, fn: () => void): void {
    try {
        fn()
    } catch (error) {
        logHandlerFailure(message, error)
    }
}

async function runSafelyAsync(
    message: string,
    fn: () => Promise<void>,
): Promise<void> {
    try {
        await fn()
    } catch (error) {
        logHandlerFailure(message, error)
    }
}

export const setupErrorHandlers = (player: PlayerEvents): void => {
    player.events.on('error', (queue: GuildQueue, error: Error) => {
        runSafely('Queue error handler failed:', () => {
            const details = toErrorDetails(error)
            safeErrorLog({
                message: `Error in queue ${queue?.guild?.name || 'unknown'}:`,
                error: toErrorInstance(error),
                data: {
                    guildId: queue?.guild?.id ?? 'unknown',
                    guildName: queue?.guild?.name ?? 'unknown',
                    ...details,
                },
            })

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

    player.events.on('playerError', (queue: GuildQueue, error: Error) => {
        void runSafelyAsync('Player error event handler failed:', async () => {
            await handlePlayerError(queue, error)
        })
    })

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
                safeErrorLog({
                    message: 'Unhandled player error:',
                    error: toErrorInstance(error),
                    data: toErrorDetails(error),
                })
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

function handleYouTubeParserError(
    queue: GuildQueue,
    error: Error,
    youtubeErrorInfo: ReturnType<typeof analyzeYouTubeError>,
): void {
    const requestedBy: User | undefined =
        queue.currentTrack?.requestedBy ??
        (queue.metadata as IQueueMetadata).requestedBy ??
        undefined
    logYouTubeError(
        error,
        `player error in ${queue.guild.name}`,
        requestedBy?.id ?? 'unknown',
    )

    debugLog({
        message: 'YouTube parser error detected, skipping current track',
        data: {
            errorType: youtubeErrorInfo.isCompositeVideoError
                ? 'CompositeVideoPrimaryInfo'
                : youtubeErrorInfo.isHypePointsError
                  ? 'HypePointsFactoid'
                  : youtubeErrorInfo.isTypeMismatchError
                    ? 'TypeMismatch'
                    : 'Parser',
        },
    })

    if (youtubeConfig.errorHandling.skipOnParserError) {
        queue.node.skip()
    }
}

async function recoverFromStreamExtractionError(
    queue: GuildQueue,
    currentTrack: NonNullable<GuildQueue['currentTrack']>,
): Promise<void> {
    debugLog({
        message: `Problematic URL: ${currentTrack.url}`,
    })

    const requestedByUser: User | undefined =
        currentTrack.requestedBy ??
        (queue.metadata as IQueueMetadata).requestedBy ??
        undefined
    if (!requestedByUser) {
        warnLog({
            message: 'Stream failed, skipping — no requestedBy to search with',
            data: { title: currentTrack.title, guildId: queue.guild.id },
        })
        await notifyChannelStreamFailed(queue, currentTrack.title)
        queue.node.skip()
        return
    }

    // Timeout guard: if YouTube search hangs (no response in 10s), skip the
    // track rather than blocking the player indefinitely.
    const searchTimeout = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), 10_000).unref(),
    )
    const searchResult = await Promise.race([
        queue.player.search(currentTrack.title, {
            requestedBy: requestedByUser,
            searchEngine: QueryType.YOUTUBE_SEARCH,
        }),
        searchTimeout,
    ])

    if (!searchResult || searchResult.tracks.length === 0) {
        warnLog({
            message: 'Stream failed, YouTube recovery found nothing — skipping',
            data: { title: currentTrack.title, guildId: queue.guild.id },
        })
        await notifyChannelStreamFailed(queue, currentTrack.title)
        queue.node.skip()
        return
    }

    const alternativeTrack = searchResult.tracks.find(
        (track) => track.url !== currentTrack.url,
    )

    if (alternativeTrack) {
        // Insert at the front of the queue so the alternative plays immediately
        // after we skip the failing current track. Using insertTrack(0) avoids
        // accidentally removing a legitimately queued user track.
        queue.insertTrack(alternativeTrack, 0)
        queue.node.skip()
        providerHealthService.recordSuccess(providerFromTrack(currentTrack))
        debugLog({
            message: 'Successfully recovered from stream extraction error',
            data: {
                title: currentTrack.title,
                alternativeUrl: alternativeTrack.url,
            },
        })
    } else {
        warnLog({
            message:
                'Stream failed, all YouTube alternatives already in queue — skipping',
            data: { title: currentTrack.title, guildId: queue.guild.id },
        })
        await notifyChannelStreamFailed(queue, currentTrack.title)
        queue.node.skip()
    }
}

const handlePlayerError = async (
    queue: GuildQueue,
    error: Error,
): Promise<void> => {
    try {
        const currentTrackProvider = providerFromTrack(
            queue.currentTrack ?? undefined,
        )
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

        errorLog({
            message: `Player error in queue ${queue.guild.name}:`,
            error: toErrorInstance(error),
            data: {
                guildId: queue.guild.id,
                guildName: queue.guild.name,
                ...toErrorDetails(error),
            },
        })

        const isStreamExtractionError =
            error.message.includes('Could not extract stream') ||
            error.message.includes('Streaming data not available') ||
            error.message.includes('chooseFormat')

        if (isStreamExtractionError) {
            debugLog({
                message:
                    'Detected stream extraction error, attempting recovery...',
            })

            try {
                const currentTrack = queue.currentTrack
                if (currentTrack) {
                    await recoverFromStreamExtractionError(queue, currentTrack)
                } else {
                    queue.node.skip()
                }
            } catch (recoveryError) {
                logHandlerFailure(
                    'Failed to recover from stream extraction error:',
                    recoveryError,
                )
                const failedTrack = queue.currentTrack
                if (failedTrack) {
                    await notifyChannelStreamFailed(queue, failedTrack.title)
                }
                queue.node.skip()
            }
        }
    } catch (handlerError) {
        logHandlerFailure('Error in player error handler:', handlerError)
    }
}
