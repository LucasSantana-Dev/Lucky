import type { Guild } from 'discord.js'
import { debugLog, infoLog } from '@lucky/shared/utils'
import { resolveRecapChannel } from './recapScheduler'
import { autoEnableRecap } from './recapStore'

// Guilds this process already tried, so a busy guild costs one write per
// restart rather than one per /play.
const tried = new Set<string>()

/**
 * Turns the weekly recap on in the channel of a guild's first successful
 * /play (#2738). A channel the recap cannot post in is skipped without
 * marking the guild, so a later /play elsewhere can still turn it on.
 */
export async function maybeAutoEnableRecap(
    guild: Guild,
    channelId: string,
    now: Date = new Date(),
): Promise<void> {
    if (tried.has(guild.id)) return
    const target = await resolveRecapChannel(guild, channelId)
    if ('reason' in target) {
        debugLog({
            message: 'recap: play channel unusable, auto-enable skipped',
            data: { guildId: guild.id, channelId, reason: target.reason },
        })
        return
    }
    // Marked before the write: a failing write is logged once, not per play.
    tried.add(guild.id)
    if (await autoEnableRecap(guild.id, target.channel.id, now)) {
        infoLog({
            message: 'recap: enabled on first play',
            data: { guildId: guild.id, channelId: target.channel.id },
        })
    }
}

export function __resetRecapAutoEnableForTests(): void {
    tried.clear()
}
