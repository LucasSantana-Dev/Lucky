import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import { musicEmbed } from '../../../utils/general/embeds'
import type { CommandExecuteParams } from '../../../types/CommandData'
import {
    requireQueue,
    requireCurrentTrack,
} from '../../../utils/command/commandValidations'

/**
 * Get time left text from queue timestamp
 */
function getTimeLeftText(queue: { node: { getTimestamp: () => { current: number; total: number } | null } }): string {
    if (!queue?.node || typeof queue.node.getTimestamp !== 'function') {
        return ''
    }

    const ts = queue.node.getTimestamp()
    if (
        ts === null ||
        ts === undefined ||
        typeof ts.current !== 'number' ||
        typeof ts.total !== 'number'
    ) {
        return ''
    }

    const secondsLeft = Math.max(0, ts.total - ts.current)
    const minutes = Math.floor(secondsLeft / 60)
    const seconds = secondsLeft % 60

    return `\nTempo restante: **${minutes}:${seconds.toString().padStart(2, '0')}**`
}

/**
 * Get track property with fallback
 */
function getTrackProperty(
    track: Record<string, unknown>,
    property: string,
    fallback: string,
): string {
    return (track?.[property] as string) ?? fallback
}

/**
 * Format track title with URL
 */
function formatTrackTitle(track: { title: string; url: string }): string {
    const title = getTrackProperty(track, 'title', 'Unknown')
    const url = getTrackProperty(track, 'url', '')
    return `[**${title}**](${url})`
}

/**
 * Format track metadata
 */
function formatTrackMetadata(track: { requestedBy?: { username: string } }): string {
    const author = getTrackProperty(track, 'author', 'Unknown')
    const duration = getTrackProperty(track, 'duration', 'Unknown')
    const requester = track?.requestedBy?.username ?? 'Desconhecido'

    return `Autor: **${author}**\nDuração: **${duration}**\nSolicitado por: **${requester}**`
}

/**
 * Format track information
 */
function formatTrackInfo(track: unknown, timeLeftText: string): string {
    const title = formatTrackTitle(track as { title: string; url: string })
    const metadata = formatTrackMetadata(track as { requestedBy?: { username: string } })

    return `${title}\n${metadata}${timeLeftText}`
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('songinfo')
        .setDescription(
            '🎶 Mostra informações da música que está tocando agora.',
        ),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        const queue = client.player.nodes.get(interaction.guildId ?? '')
        const track = queue?.currentTrack

        if (!(await requireQueue(queue, interaction))) return
        if (!(await requireCurrentTrack(queue, interaction))) return

        const timeLeftText = getTimeLeftText(queue as { node: { getTimestamp: () => { current: number; total: number } | null } })
        const trackInfo = formatTrackInfo(track, timeLeftText)
        const embed = musicEmbed('Tocando Agora', trackInfo)

        if (track?.thumbnail) embed.setThumbnail(track.thumbnail)

        await interactionReply({
            interaction,
            content: { embeds: [embed] },
        })
    },
})
