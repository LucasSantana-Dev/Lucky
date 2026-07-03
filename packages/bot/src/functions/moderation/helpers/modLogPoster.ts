import type { Guild, EmbedBuilder } from 'discord.js'
import { moderationService } from '@lucky/shared/services'
import { errorLog } from '@lucky/shared/utils'

/**
 * Posts a moderation case embed to the guild's configured mod-log channel
 * (`ModerationSettings.modLogChannelId`), mirroring what the command already
 * replied with in-channel. No-op if unconfigured, missing, or not sendable —
 * failures here must never break the underlying moderation action.
 */
export async function postToModLog(
    guild: Guild,
    embed: EmbedBuilder,
): Promise<void> {
    try {
        const settings = await moderationService.getSettings(guild.id)
        if (!settings.modLogChannelId) return

        const channel =
            guild.channels.cache.get(settings.modLogChannelId) ??
            (await guild.channels
                .fetch(settings.modLogChannelId)
                .catch(() => null))

        if (!channel || !channel.isTextBased() || channel.isDMBased()) return

        await channel.send({ embeds: [embed] })
    } catch (error) {
        errorLog({
            message: `Failed to post to mod-log channel in ${guild.name}`,
            error: error as Error,
        })
    }
}
