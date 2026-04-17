import type { GuildQueue, Track } from 'discord-player'
import { errorLog } from '@lucky/shared/utils'
import { musicWatchdogService } from '../../utils/music/watchdog'
import { musicSessionSnapshotService } from '../../utils/music/sessionSnapshots'
import * as voiceStatus from '../../services/VoiceChannelStatusService'
import {
    setReplenishSuppressed,
} from '../../utils/music/replenishSuppressionStore'

/**
 * Handles queue exhaustion logic shared between finish and skip events.
 * Manages replenishment suppression, snapshot clearing, watchdog arming,
 * and voice status updates when queue becomes empty.
 */
export async function handleQueueExhaustion(
    queue: GuildQueue,
    replenishIfAutoplay: (queue: GuildQueue, track?: Track) => Promise<void>,
): Promise<void> {
    try {
        if (musicWatchdogService.isIntentionalStop(queue.guild.id)) return
        await replenishIfAutoplay(queue)
        await musicSessionSnapshotService.saveSnapshot(queue)

        if (queue.currentTrack || queue.tracks.size > 0) {
            musicWatchdogService.arm(queue)
        } else {
            await voiceStatus.clearStatus(queue)
            musicWatchdogService.clear(queue.guild.id)
            setReplenishSuppressed(queue.guild.id, 35_000)
            await musicSessionSnapshotService.clearSnapshotIfStale(queue)
        }
    } catch (error) {
        errorLog({ message: 'Error handling queue exhaustion:', error })
    }
}
