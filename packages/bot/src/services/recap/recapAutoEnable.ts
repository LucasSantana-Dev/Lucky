import type { Guild } from 'discord.js'
import { recordActivationEvent } from '@lucky/shared/services'
import { infoLog } from '@lucky/shared/utils'
import { resolveRecapChannel } from './recapScheduler'
import { autoEnableRecap } from './recapStore'

// Guilds this process already tried, so a busy guild costs one write per
// restart rather than one per /play.
const tried = new Set<string>()
// Guilds whose unusable play channel was already reported, so a session of
// plays from a voice channel chat logs one line, not one per play.
const reportedSkips = new Set<string>()

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
    // Marked before any await, so overlapping plays try once. Unmarked again
    // only when the channel is unusable or its check throws; a failing write
    // stays marked, so it is logged once, not per play.
    tried.add(guild.id)
    let target: Awaited<ReturnType<typeof resolveRecapChannel>>
    try {
        target = await resolveRecapChannel(guild, channelId)
    } catch (error) {
        tried.delete(guild.id)
        throw error
    }
    if ('reason' in target) {
        tried.delete(guild.id)
        // Info, not debug: prod logs drop debug lines, and this is the one
        // sign of a guild that plays but never gets the recap (#2860).
        if (!reportedSkips.has(guild.id)) {
            reportedSkips.add(guild.id)
            infoLog({
                message: 'recap: play channel unusable, auto-enable skipped',
                data: { guildId: guild.id, channelId, reason: target.reason },
            })
        }
        return
    }
    if (await autoEnableRecap(guild.id, target.channel.id, now)) {
        infoLog({
            message: 'recap: enabled on first play',
            data: { guildId: guild.id, channelId: target.channel.id },
        })
        void recordActivationEvent(guild.id, 'recap_auto_enabled').catch(
            () => undefined,
        )
    }
}

export function __resetRecapAutoEnableForTests(): void {
    tried.clear()
    reportedSkips.clear()
}
