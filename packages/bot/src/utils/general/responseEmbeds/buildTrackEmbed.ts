import { EmbedBuilder } from 'discord.js'
import type { User } from 'discord.js'
import { detectSource } from '../../music/nowPlayingEmbed'

export type TrackEmbedKind = 'queued' | 'playing' | 'recommended' | 'history'

type TrackData = {
    title?: string
    author?: string
    url?: string
    thumbnail?: string
    duration?: string
    source?: string | null
}

const KIND_LABELS: Record<TrackEmbedKind, string> = {
    playing: 'Now Playing',
    queued: 'Queued',
    recommended: 'Recommended',
    history: 'From History',
}

export function buildTrackEmbed(
    track: TrackData,
    kind: TrackEmbedKind,
    requestedBy?: Pick<User, 'tag' | 'displayAvatarURL'>,
): EmbedBuilder {
    const badge = detectSource(track)
    const label = KIND_LABELS[kind]

    const embed = new EmbedBuilder()
        .setAuthor({ name: `${badge.emoji} ${label}` })
        .setColor(badge.color)
        .setTimestamp()

    if (requestedBy) {
        embed.setFooter({
            text: `Requested by ${requestedBy.tag}`,
            iconURL: requestedBy.displayAvatarURL({ size: 64 }),
        })
    }

    if (track.thumbnail) embed.setThumbnail(track.thumbnail)

    embed.setTitle(track.title ?? 'Unknown Track')
    if (track.url) embed.setURL(track.url)
    embed.setDescription(`by **${track.author ?? 'Unknown artist'}**`)

    const fields: { name: string; value: string; inline: boolean }[] = []
    if (track.duration && track.duration !== '0:00') {
        fields.push({ name: 'Duration', value: track.duration, inline: true })
    }
    fields.push({ name: 'Source', value: badge.label, inline: true })

    embed.addFields(fields)
    return embed
}
