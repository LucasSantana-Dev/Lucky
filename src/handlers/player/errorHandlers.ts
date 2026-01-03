import type { GuildQueue } from 'discord-player'
import { errorLog, debugLog } from '../../utils/general/log'
import {
    analyzeYouTubeError,
    logYouTubeError,
} from '../../utils/music/youtubeErrorHandler'

type PlayerEvents = {
    events: {
        on: (event: string, handler: Function) => void
    }
}

export const setupErrorHandlers = (player: PlayerEvents): void => {
    player.events.on('error', (queue: GuildQueue, error: Error) => {
        errorLog({
            message: `Error in queue ${queue?.guild?.name || 'unknown'}:`,
            error,
        })
    })

    player.events.on('playerError', async (queue: GuildQueue, error: Error) => {
        await handlePlayerError(queue, error)
    })
}

const handlePlayerError = async (
    queue: GuildQueue,
    error: Error,
): Promise<void> => {
    try {
        const errorAnalysis = analyzeYouTubeError(error)

        if (
            errorAnalysis.isParserError ||
            errorAnalysis.isCompositeVideoError
        ) {
            await logYouTubeError(error, queue.guild.name, queue.guild.id)

            if (errorAnalysis.shouldRetry) {
                debugLog({ message: 'Retrying track due to YouTube error' })
                await queue.node.skip()
                return
            }
        }

        errorLog({
            message: `Player error in ${queue.guild.name}:`,
            error,
        })

        if ((queue.metadata as { channel?: unknown })?.channel) {
            const { channel } = queue.metadata as { channel: unknown }
            try {
                await (channel as { send: (options: { content: string }) => Promise<unknown> }).send({
                    content: `❌ An error occurred while playing music: ${error.message}`,
                })
            } catch (sendError) {
                errorLog({
                    message: 'Failed to send error message to channel:',
                    error: sendError,
                })
            }
        }
    } catch (handlerError) {
        errorLog({
            message: 'Error in player error handler:',
            error: handlerError,
        })
    }
}
