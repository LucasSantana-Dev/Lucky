import { guildService } from '../services/GuildService'
import { AppError } from '../errors/AppError'

/**
 * Throws a 400 unless `channelId` is one of the guild's channels, so a
 * dashboard write cannot point the bot at a channel in another server.
 * Fails closed: if the channel list cannot be fetched, the write is refused.
 */
export async function assertChannelInGuild(
    guildId: string,
    channelId: string,
): Promise<void> {
    const channels = await guildService.getGuildTextChannelOptions(guildId)
    if (!channels.some((channel) => channel.id === channelId)) {
        throw AppError.badRequest('Channel does not belong to this server')
    }
}
