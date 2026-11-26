import {
    ChannelType,
    PermissionFlagsBits,
    type Guild,
    type GuildBasedChannel,
} from 'discord.js'

/**
 * First text channel the bot can actually post to (system channel preferred).
 * Shared by the welcome message and the first-play reminder, so both land in
 * the same place.
 */
export function findOnboardingChannel(guild: Guild): GuildBasedChannel | null {
    const me = guild.members?.me
    if (!me) return null
    const canPost = (ch: GuildBasedChannel | null): boolean =>
        ch?.type === ChannelType.GuildText &&
        (ch
            .permissionsFor(me)
            ?.has([
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks,
            ]) ??
            false)
    if (canPost(guild.systemChannel)) return guild.systemChannel
    return guild.channels.cache.find((ch) => canPost(ch)) ?? null
}
