import type { CustomClient } from '../../types'
import {
    musicControlService,
    type MusicCommand,
    type MusicCommandResult,
} from '@lucky/shared/services'
import { infoLog, errorLog, warnLog, debugLog } from '@lucky/shared/utils'
import { buildQueueState } from './mappers'
import * as playback from './commandHandlers'
import * as queue from './queueHandlers'
import { createGuildWarnThrottle } from '../../utils/misc/guildWarnThrottle'

// #2160: the periodic publish tick runs every 30s, so cap its failure warn to
// once per minute per guild instead of every tick.
const publishWarnThrottle = createGuildWarnThrottle(60_000)

const commandMap: Record<
    string,
    (client: CustomClient, cmd: MusicCommand) => Promise<MusicCommandResult>
> = {
    get_state: playback.handleGetState,
    play: playback.handlePlay,
    pause: playback.handlePause,
    resume: playback.handleResume,
    skip: playback.handleSkip,
    previous: playback.handlePrevious,
    stop: playback.handleStop,
    volume: playback.handleVolume,
    shuffle: playback.handleShuffle,
    repeat: playback.handleRepeat,
    seek: playback.handleSeek,
    queue_move: queue.handleQueueMove,
    queue_remove: queue.handleQueueRemove,
    queue_clear: queue.handleQueueClear,
    import_playlist: queue.handleImportPlaylist,
}

async function handleCommand(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<MusicCommandResult> {
    try {
        const handler = commandMap[cmd.type]
        if (!handler) {
            return {
                id: cmd.id,
                guildId: cmd.guildId,
                success: false,
                error: `Unknown command: ${cmd.type}`,
                timestamp: Date.now(),
            }
        }
        return await handler(client, cmd)
    } catch (error) {
        errorLog({
            message: `Error handling web music command ${cmd.type}:`,
            error,
        })
        return {
            id: cmd.id,
            guildId: cmd.guildId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now(),
        }
    }
}

let webMusicPublishInterval: ReturnType<typeof setInterval> | null = null

export async function setupWebMusicHandler(
    client: CustomClient,
): Promise<void> {
    try {
        await musicControlService.connect()

        await musicControlService.subscribeToCommands(
            async (cmd: MusicCommand) => {
                debugLog({
                    message: `Received web music command: ${cmd.type} for guild ${cmd.guildId}`,
                })
                const result = await handleCommand(client, cmd)
                await musicControlService.sendResult(result)
            },
        )

        client.player.events.on(
            'playerStart',
            async (q: { guild: { id: string } }) => {
                const state = await buildQueueState(client, q.guild.id)
                await musicControlService.publishState(state)
            },
        )

        client.player.events.on(
            'playerFinish',
            async (q: { guild: { id: string } }) => {
                setTimeout(() => {
                    void (async () => {
                        const state = await buildQueueState(client, q.guild.id)
                        await musicControlService.publishState(state)
                    })().catch((error) => {
                        errorLog({
                            message:
                                'Error publishing queue state after playerFinish:',
                            error,
                        })
                    })
                }, 500)
            },
        )

        client.player.events.on(
            'audioTracksAdd',
            async (q: { guild: { id: string } }) => {
                const state = await buildQueueState(client, q.guild.id)
                await musicControlService.publishState(state)
            },
        )

        // Periodically publish state for all active queues to keep SSE clients in sync.
        // Clear any prior handle first — a second setup() call (e.g. reconnect) would
        // otherwise orphan the previous interval and double-publish forever.
        if (webMusicPublishInterval) {
            clearInterval(webMusicPublishInterval)
        }
        webMusicPublishInterval = setInterval(async () => {
            let currentGuildId: string | undefined
            try {
                for (const queue of client.player.nodes.cache.values()) {
                    if (!queue) continue
                    currentGuildId = queue.guild.id
                    const state = await buildQueueState(client, queue.guild.id)
                    // Only publish if queue is active (playing or has tracks)
                    if (state.isPlaying || state.tracks.length > 0) {
                        await musicControlService.publishState(state)
                    }
                }
            } catch (error) {
                if (publishWarnThrottle.shouldWarn(currentGuildId)) {
                    warnLog({
                        message: 'Error during periodic state publish',
                        data: {
                            guildId: currentGuildId,
                            error:
                                error instanceof Error
                                    ? error.message
                                    : String(error),
                        },
                    })
                }
            }
        }, 30000)

        infoLog({ message: 'Web music handler initialized' })
    } catch (error) {
        errorLog({ message: 'Failed to setup web music handler:', error })
    }
}

export function stopWebMusicHandler(): void {
    if (webMusicPublishInterval) {
        clearInterval(webMusicPublishInterval)
        webMusicPublishInterval = null
    }
    publishWarnThrottle.clear()
}
