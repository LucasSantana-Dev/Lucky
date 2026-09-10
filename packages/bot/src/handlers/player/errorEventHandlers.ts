import type { GuildQueue } from 'discord-player'
import { errorLog, debugLog, captureException } from '@lucky/shared/utils'
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
import { notifyChannelStreamFailed } from './streamFailureNotifier'
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

    player.events.on('playerError', (queue: GuildQueue, error: Error) => {
        void handlePlayerErrorSafely(queue, error)
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
): Promise<void> {
    try {
        await handlePlayerError(queue, error)
    } catch (err) {
        logHandlerFailure('Player error event handler failed:', err)
    }
}

export async function handlePlayerError(
    queue: GuildQueue,
    error: Error,
): Promise<void> {
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
        captureException(toErrorInstance(error) ?? new Error(String(error)), {
            context: 'player-error',
            guildId: queue.guild.id,
            provider: currentTrackProvider,
            trackUrl: queue.currentTrack?.url,
        })

        const isStreamExtractionError =
            error.message.includes('Could not extract stream') ||
            error.message.includes('Streaming data not available') ||
            error.message.includes('chooseFormat') ||
            error.message.includes('Bridge exhausted')

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
