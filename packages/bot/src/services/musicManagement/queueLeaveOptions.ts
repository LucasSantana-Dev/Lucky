import type { GuildQueue } from 'discord-player'
import { guildSettingsService } from '@lucky/shared/services'

/**
 * How long a queue stays connected after its track list is empty or the
 * voice channel empties.
 * discord-player defaults both cooldowns to 0, so a queue created without
 * these leaves the moment it runs dry, before an autoplay refill lands (#2932).
 */
export const QUEUE_LEAVE_OPTIONS = {
    leaveOnEmpty: true,
    leaveOnEmptyCooldown: 30_000,
    leaveOnEnd: true,
    leaveOnEndCooldown: 300_000,
} as const

/**
 * 24/7 mode (`/247`): Lucky stays in the voice channel when the queue ends or
 * the channel empties. discord-player keeps `pauseOnEmpty` on by default, so
 * an empty channel pauses playback instead of streaming to nobody.
 */
export const STAY_CONNECTED_LEAVE_OPTIONS = {
    leaveOnEmpty: false,
    leaveOnEmptyCooldown: 30_000,
    leaveOnEnd: false,
    leaveOnEndCooldown: 300_000,
} as const

export type QueueLeaveOptions =
    typeof QUEUE_LEAVE_OPTIONS | typeof STAY_CONNECTED_LEAVE_OPTIONS

export function leaveOptionsForStayConnected(
    stayConnected: boolean,
): QueueLeaveOptions {
    return stayConnected ? STAY_CONNECTED_LEAVE_OPTIONS : QUEUE_LEAVE_OPTIONS
}

/** Whether the guild turned on 24/7 mode. False when settings can't load. */
export async function isStayConnected(guildId: string): Promise<boolean> {
    try {
        const settings = await guildSettingsService.getGuildSettings(guildId)
        return settings?.stayConnected === true
    } catch {
        return false
    }
}

/** Leave options for a new queue in this guild, honouring 24/7 mode. */
export async function queueLeaveOptionsFor(
    guildId: string,
): Promise<QueueLeaveOptions> {
    return leaveOptionsForStayConnected(await isStayConnected(guildId))
}

/**
 * Applies 24/7 mode to a queue that is already running. discord-player reads
 * `queue.options.leaveOnEmpty` / `leaveOnEnd` each time the channel empties or
 * the queue ends, so updating them takes effect from the next such event. A
 * leave timer that is already counting down is not cancelled.
 */
export function applyLeaveOptionsToQueue(
    queue: GuildQueue,
    stayConnected: boolean,
): void {
    const options = leaveOptionsForStayConnected(stayConnected)
    queue.options.leaveOnEmpty = options.leaveOnEmpty
    queue.options.leaveOnEnd = options.leaveOnEnd
}
