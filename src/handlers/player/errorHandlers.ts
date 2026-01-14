import { QueryType, type GuildQueue } from 'discord-player'
import type { User } from 'discord.js'
import { errorLog, debugLog } from '../../utils/general/log'
import {
    analyzeYouTubeError,
    logYouTubeError,
} from '../../utils/music/youtubeErrorHandler'
import { youtubeConfig } from '../../config/youtubeConfig'

type PlayerEvents = {
    events: {
        on: (event: string, handler: Function) => void
    }
}

interface IQueueMetadata {
    requestedBy?: User | null
}

export const setupErrorHandlers = (player: PlayerEvents): void => {
    player.events.on('error', (queue: GuildQueue, error: Error) => {
        errorLog({
            message: `Error in queue ${queue?.guild?.name || 'unknown'}:`,
            error,
        })

        const isConnectionError =
            error.message.includes('ECONNRESET') ||
            error.message.includes('ECONNREFUSED') ||
            error.message.includes('ETIMEDOUT') ||
            error.message.includes('Connection reset by peer')

        if (isConnectionError && queue?.connection) {
            debugLog({
                message: 'Detected connection error, attempting recovery...',
            })
            try {
                if (queue.connection.state.status !== 'ready') {
                    queue.connection.rejoin()
                    debugLog({
                        message: 'Attempting to recover from connection error',
                    })
                }
            } catch (recoveryError) {
                errorLog({
                    message: 'Failed to recover from connection error:',
                    error: recoveryError,
                })
            }
        }
    })

    player.events.on('playerError', async (queue: GuildQueue, error: Error) => {
        await handlePlayerError(queue, error)
    })

    player.events.on('debug', (queue: GuildQueue, message: string) => {
        debugLog({
            message: `Player debug from ${queue.guild.name}: ${message}`,
        })
    })
}

function handleYouTubeParserError(
    queue: GuildQueue,
    error: Error,
    youtubeErrorInfo: ReturnType<typeof analyzeYouTubeError>,
): void {
    const requestedBy: User | undefined = queue.currentTrack?.requestedBy ??
        (queue.metadata as IQueueMetadata).requestedBy ?? undefined
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

    const requestedByUser: User | undefined = currentTrack.requestedBy ??
        (queue.metadata as IQueueMetadata).requestedBy ?? undefined
    if (!requestedByUser) {
        queue.node.skip()
        return
    }

    const searchResult = await queue.player.search(
        currentTrack.title,
        {
            requestedBy: requestedByUser,
            searchEngine: QueryType.YOUTUBE_SEARCH,
        },
    )

    if (!searchResult || searchResult.tracks.length === 0) {
        queue.node.skip()
        return
    }

    const alternativeTrack = searchResult.tracks.find(
        (track) => track.url !== currentTrack.url,
    )

    if (alternativeTrack) {
        queue.removeTrack(0)
        queue.addTrack(alternativeTrack)
        if (!queue.node.isPlaying()) {
            await queue.node.play()
            debugLog({
                message: 'Successfully recovered from stream extraction error',
            })
        }
    } else {
        queue.node.skip()
    }
}

const handlePlayerError = async (
    queue: GuildQueue,
    error: Error,
): Promise<void> => {
    try {
        const youtubeErrorInfo = analyzeYouTubeError(error)

        if (youtubeErrorInfo.isParserError) {
            handleYouTubeParserError(queue, error, youtubeErrorInfo)
            return
        }

        errorLog({
            message: `Player error in queue ${queue.guild.name}:`,
            error,
        })

        const isStreamExtractionError =
            error.message.includes('Could not extract stream') ||
            error.message.includes('Streaming data not available') ||
            error.message.includes('chooseFormat')

        if (isStreamExtractionError) {
            debugLog({
                message: 'Detected stream extraction error, attempting recovery...',
            })

            try {
                const currentTrack = queue.currentTrack
                if (currentTrack) {
                    await recoverFromStreamExtractionError(queue, currentTrack)
                } else {
                    queue.node.skip()
                }
            } catch (recoveryError) {
                errorLog({
                    message: 'Failed to recover from stream extraction error:',
                    error: recoveryError,
                })
                queue.node.skip()
            }
        }
    } catch (handlerError) {
        errorLog({
            message: 'Error in player error handler:',
            error: handlerError,
        })
    }
}
