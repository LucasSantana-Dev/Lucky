/**
 * Response handling utilities
 */

import type { PlayCommandResult } from './types'
import { EmbedBuilder } from 'discord.js'

export function createSuccessResponse(
    result: PlayCommandResult,
    query: string,
): { content: string; embeds: EmbedBuilder[] } {
    const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('🎵 Track Added to Queue')
        .setDescription(`Successfully processed: **${query}**`)
        .setTimestamp()

    if (result.tracks && result.tracks.length > 0) {
        const track = result.tracks[0]
        embed.addFields(
            {
                name: 'Track',
                value: `[${track.title}](${track.url})`,
                inline: true,
            },
            { name: 'Duration', value: track.duration, inline: true },
            {
                name: 'Requested by',
                value: `<@${result.tracks[0].requestedBy?.id ?? 'Unknown'}>`,
                inline: true,
            },
        )

        if (result.isPlaylist === true && result.tracks.length > 1) {
            embed.setDescription(
                `Successfully processed playlist: **${query}**\nAdded **${result.tracks.length}** tracks to queue`,
            )
        }
    }

    return {
        content: '',
        embeds: [embed],
    }
}
