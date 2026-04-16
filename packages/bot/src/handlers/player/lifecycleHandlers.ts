import type { GuildQueue } from 'discord-player'
import type { Client } from 'discord.js'
import { infoLog, debugLog } from '@lucky/shared/utils'
import * as voiceStatus from '../../services/VoiceChannelStatusService'
import { ENVIRONMENT_CONFIG } from '@lucky/shared/config'
import { musicWatchdogService } from '../../utils/music/watchdog'
import { musicSessionSnapshotService } from '../../utils/music/sessionSnapshots'
import type { QueueMetadata } from '../../types/QueueMetadata'

export const setupVoiceKickDetection = (client: Client): void => {
    client.on('voiceStateUpdate', (oldState, newState) => {
        if (newState.member?.id !== client.user?.id) return
        const wasInChannel = Boolean(oldState.channelId)
        const nowDisconnected = !newState.channelId
        if (wasInChannel && nowDisconnected && oldState.guild) {
            musicWatchdogService.markIntentionalStop(oldState.guild.id)
            infoLog({
                message: `Bot was disconnected from voice in ${oldState.guild.name} — marked intentional`,
            })
        }
    })
}

export const setupLifecycleHandlers = (player: {
    events: { on: (event: string, handler: Function) => void }
}): void => {
    player.events.on('debug', (queue: GuildQueue, message: string) => {
        debugLog({
            message: `Player debug from ${queue.guild.name}: ${message}`,
        })
    })

    player.events.on('connection', async (queue: GuildQueue) => {
        infoLog({
            message: `Created connection to voice channel in ${queue.guild.name}`,
        })

        if (queue.connection) {
            debugLog({
                message: 'Voice connection details',
                data: {
                    state: queue.connection.state?.status,
                    joinConfig: queue.connection.joinConfig,
                    ready: queue.connection.state?.status === 'ready',
                },
            })
        }

        if (ENVIRONMENT_CONFIG.MUSIC.SESSION_RESTORE_ENABLED) {
            const metadata = queue.metadata as QueueMetadata | undefined

            await musicSessionSnapshotService.restoreSnapshot(
                queue,
                metadata?.requestedBy ?? undefined,
            )
        }

        musicWatchdogService.arm(queue)
    })

    player.events.on('connectionDestroyed', async (queue: GuildQueue) => {
        infoLog({
            message: `Destroyed connection to voice channel in ${queue.guild.name}`,
        })

        await voiceStatus.clearStatus(queue)
        await musicSessionSnapshotService.saveSnapshot(queue)
        // Queue was explicitly deleted — never attempt recovery here.
    })

    player.events.on('emptyChannel', async (queue: GuildQueue) => {
        infoLog({ message: `Channel is empty in ${queue.guild.name}` })
        await voiceStatus.clearStatus(queue)
        await musicSessionSnapshotService.saveSnapshot(queue)
        musicWatchdogService.clear(queue.guild.id)
    })

    player.events.on('emptyQueue', async (queue: GuildQueue) => {
        musicWatchdogService.markIntentionalStop(queue.guild.id)
    })

    player.events.on('disconnect', async (queue: GuildQueue) => {
        infoLog({
            message: `Disconnected from voice channel in ${queue.guild.name}`,
        })

        await voiceStatus.clearStatus(queue)
        await musicSessionSnapshotService.saveSnapshot(queue)
        if (!musicWatchdogService.isIntentionalStop(queue.guild.id)) {
            await musicWatchdogService.checkAndRecover(queue)
        }
    })
}
