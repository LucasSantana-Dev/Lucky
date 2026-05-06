import { QueueRepeatMode } from 'discord-player'
import { guildSettingsService } from '@lucky/shared/services'
import { debugLog, warnLog } from '@lucky/shared/utils'

export async function applyStoredAutoplayPreference(
    queue: {
        repeatMode: QueueRepeatMode
        setRepeatMode: (mode: QueueRepeatMode) => void
    },
    guildId: string,
): Promise<void> {
    try {
        const settings = await guildSettingsService.getGuildSettings(guildId)
        const repeatMode =
            (settings?.autoPlayEnabled ?? true)
                ? QueueRepeatMode.AUTOPLAY
                : QueueRepeatMode.OFF

        if (queue.repeatMode !== repeatMode) {
            queue.setRepeatMode(repeatMode)
        }

        debugLog({
            message: 'Applied stored autoplay preference to queue',
            data: {
                guildId,
                autoPlayEnabled: settings?.autoPlayEnabled ?? true,
            },
        })
    } catch (error) {
        warnLog({
            message: 'Failed to apply stored autoplay preference',
            error,
            data: { guildId },
        })
    }
}
