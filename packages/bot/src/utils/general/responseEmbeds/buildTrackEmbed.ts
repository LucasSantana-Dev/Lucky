import { EmbedBuilder } from 'discord.js'
import type { User } from 'discord.js'
import type { Track } from 'discord-player'
import { detectSource } from '../../music/nowPlayingEmbed'
import { trackSource } from '../../music/trackFields'
import { formatDurationClock } from '../formatDuration'

export type TrackEmbedKind = 'queued' | 'playing' | 'recommended' | 'history'

export type TrackData = {
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

export type TrackEmbedOptions = {
    /**
     * A pre-rendered playback progress bar (e.g. discord-player's
     * `queue.node.createProgressBar()`). Rendered as its own field so a user
     * can see how far into the track playback is. Null/undefined for tracks
     * with no live position (queued/recommended/history, or a livestream).
     */
    progressBar?: string | null
}

export function buildTrackEmbed(
    track: TrackData,
    kind: TrackEmbedKind,
    requestedBy?: Pick<User, 'tag' | 'displayAvatarURL'>,
    options?: TrackEmbedOptions,
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

    if (options?.progressBar) {
        fields.push({
            name: 'Progress',
            value: options.progressBar,
            inline: false,
        })
    }

    embed.addFields(fields)
    return embed
}

export function buildCommandTrackEmbed(
    track: Track,
    statusLabel: string,
    requestedBy: Pick<User, 'tag' | 'displayAvatarURL'>,
): ReturnType<typeof buildTrackEmbed> {
    const trackData = trackToData(track)
    const embed = buildTrackEmbed(trackData, 'playing', requestedBy)
    embed.setAuthor({ name: statusLabel })
    return embed
}

export function trackToData(track: Track): TrackData {
    return {
        title: track.title,
        author: track.author,
        url: track.url,
        thumbnail: track.thumbnail,
        duration: track.durationMS
            ? formatDurationClock(Math.floor(track.durationMS / 1000))
            : undefined,
        source: trackSource(track) ?? null,
    }
}
