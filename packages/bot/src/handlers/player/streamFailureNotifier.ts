import type { GuildQueue } from 'discord-player'
import { debugLog } from '@lucky/shared/utils'
import { createErrorEmbed } from '../../utils/general/embeds'
import type { QueueMetadata } from '../../types/QueueMetadata'

export async function notifyChannelStreamFailed(
    queue: GuildQueue,
    trackTitle: string,
): Promise<void> {
    const channel = (queue.metadata as QueueMetadata | undefined)?.channel
    if (!channel) return
    try {
        await channel.send({
            embeds: [
                createErrorEmbed(
                    '⚠️ Could not play track',
                    `**${trackTitle || 'this track'}** could not be streamed from any source. It may be unavailable in your region or not on SoundCloud. Skipping to next track.`,
                ),
            ],
        })
    } catch (error) {
        debugLog({
            message: 'Failed to notify channel about stream failure',
            error,
            data: { guildId: queue.guild.id, trackTitle },
        })
    }
}

export async function notifyChannelAutoplayStopped(
    queue: GuildQueue,
    failedCount: number,
): Promise<void> {
    const channel = (queue.metadata as QueueMetadata | undefined)?.channel
    if (!channel) return
    try {
        await channel.send({
            embeds: [
                createErrorEmbed(
                    '⚠️ Autoplay stopped',
                    `The last ${failedCount} autoplay tracks could not be streamed from any source, so autoplay stopped. Use /play to start again.`,
                ),
            ],
        })
    } catch (error) {
        debugLog({
            message: 'Failed to notify channel that autoplay stopped',
            error,
            data: { guildId: queue.guild.id, failedCount },
        })
    }
}
