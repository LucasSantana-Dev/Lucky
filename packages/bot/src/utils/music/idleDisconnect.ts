import type { GuildQueue } from 'discord-player'
import { guildSettingsService } from '@lucky/shared/services'
import { debugLog } from '@lucky/shared/utils'
import { musicWatchdogService } from './watchdog'
import type { TextChannel } from 'discord.js'

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

        const timer = setTimeout(() => {
            idleTimers.delete(guildId)
            void disconnectIdle(queue)
        }, timeoutMinutes * 60 * 1000)

        idleTimers.set(guildId, timer)
    })()
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
        const metadata = queue.metadata as { channel?: TextChannel } | undefined
        musicWatchdogService.markIntentionalStop(guildId)
        queue.delete()

        if (metadata?.channel) {
            await metadata.channel.send('👋 Left the voice channel due to inactivity.')
        }
    } catch (error) {
        debugLog({
            message: 'Error during idle disconnect',
            data: { guildId, error: String(error) },
        })
    }
}
