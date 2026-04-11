import type { GuildQueue } from 'discord-player'
import { infoLog, debugLog } from '@lucky/shared/utils'
import * as voiceStatus from '../../services/VoiceChannelStatusService'
import * as musicPresence from '../../services/MusicPresenceService'
import { ENVIRONMENT_CONFIG } from '@lucky/shared/config'
import { musicWatchdogService } from '../../utils/music/watchdog'
import { musicSessionSnapshotService } from '../../utils/music/sessionSnapshots'
import type { QueueMetadata } from '../../types/QueueMetadata'

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
        musicPresence.clearMusicPresence(queue.guild.id)
        await musicSessionSnapshotService.saveSnapshot(queue)
        await musicWatchdogService.checkAndRecover(queue)
    })

    player.events.on('emptyChannel', async (queue: GuildQueue) => {
        infoLog({ message: `Channel is empty in ${queue.guild.name}` })
        await voiceStatus.clearStatus(queue)
        musicPresence.clearMusicPresence(queue.guild.id)
        await musicSessionSnapshotService.saveSnapshot(queue)
        musicWatchdogService.clear(queue.guild.id)
    })

    player.events.on('disconnect', async (queue: GuildQueue) => {
        infoLog({
            message: `Disconnected from voice channel in ${queue.guild.name}`,
        })

        await voiceStatus.clearStatus(queue)
        musicPresence.clearMusicPresence(queue.guild.id)
        await musicSessionSnapshotService.saveSnapshot(queue)
        await musicWatchdogService.checkAndRecover(queue)
    })
}
