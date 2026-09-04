import type { GuildQueue } from 'discord-player'
import { guildSettingsService } from '@lucky/shared/services'
import { debugLog, errorLog, warnLog } from '@lucky/shared/utils'
import { musicWatchdogService } from './watchdog'
import { collaborativePlaylistService } from '../musicRecommendation/collaborativePlaylist'
import type { QueueMetadata } from '../../types/QueueMetadata'

const idleTimers = new Map<string, ReturnType<typeof setTimeout>>()

export function scheduleIdleDisconnect(queue: GuildQueue): void {
    const guildId = queue.guild.id
    clearIdleTimer(guildId)

    void (async () => {
        const settings = await guildSettingsService.getGuildSettings(guildId)
        const timeoutMinutes = settings?.idleTimeoutMinutes ?? 0
        if (timeoutMinutes <= 0) return

        debugLog({
            message: 'Idle disconnect scheduled',
            data: { guildId, timeoutMinutes },
        })

        const timer = setTimeout(
            () => {
                idleTimers.delete(guildId)
                void disconnectIdle(queue)
            },
            timeoutMinutes * 60 * 1000,
        )

        idleTimers.set(guildId, timer)
    })().catch((error: unknown) => {
        errorLog({
            message: `Failed to schedule idle disconnect in guild ${guildId}`,
            error,
        })
    })
}

export function clearIdleTimer(guildId: string): void {
    const timer = idleTimers.get(guildId)
    if (timer) {
        clearTimeout(timer)
        idleTimers.delete(guildId)
    }
}

async function disconnectIdle(queue: GuildQueue): Promise<void> {
    const guildId = queue.guild.id
    debugLog({ message: 'Idle disconnect triggered', data: { guildId } })

    try {
        const metadata = queue.metadata as QueueMetadata | undefined
        musicWatchdogService.markIntentionalStop(guildId)
        queue.delete()
        // Clear collaborative state only after the queue is actually torn
        // down, so a delete failure doesn't reset state for a live session.
        collaborativePlaylistService.clearGuildState(guildId)

        if (metadata?.channel) {
            try {
                await metadata.channel.send(
                    '👋 Left the voice channel due to inactivity.',
                )
            } catch (error) {
                // Farewell message failures are cosmetic — keep at debug so
                // they can't mask a real teardown failure above.
                debugLog({
                    message: 'Failed to send idle disconnect farewell message',
                    data: { guildId, error: String(error) },
                })
            }
        }
    } catch (error) {
        warnLog({
            message: 'Error during idle disconnect',
            data: { guildId, error: String(error) },
        })
    }
}
