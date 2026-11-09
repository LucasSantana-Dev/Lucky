import type { GuildQueue } from 'discord-player'
import { debugLog } from '@lucky/shared/utils'
import { createErrorEmbed } from '../../utils/general/embeds'
import type { QueueMetadata } from '../../types/QueueMetadata'

// decisions/2026-09-27-music-first-positioning.md: never name the audio
// source. No region excuse either: since 2026-10-19 most misses are YouTube
// blocking the bot, not the listener's region. No skip claim: discord-player
// has already moved on by the time this is sent (see streamRecovery.ts).
export function streamFailedDescription(trackTitle: string): string {
    return `Couldn't find the original of **${trackTitle || 'this track'}** right now, so I'm not playing a cover. Try again shortly or paste a link.`
}

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
                    streamFailedDescription(trackTitle),
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
