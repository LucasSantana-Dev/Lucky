import { EmbedBuilder } from 'discord.js'
import type { User } from 'discord.js'

const LUCKY_MUSIC_COLOR = 0x9c27b0

type SourceBadge = {
    label: string
    emoji: string
    color: number
}

const SOURCE_BADGES: Record<string, SourceBadge> = {
    spotify: {
        label: 'Spotify',
        emoji: '🟢',
        color: 0x1db954,
    },
    youtube: {
        label: 'YouTube',
        emoji: '🔴',
        color: 0xff0000,
    },
    soundcloud: {
        label: 'SoundCloud',
        emoji: '🟠',
        color: 0xff5500,
    },
    apple_music: {
        label: 'Apple Music',
        emoji: '🍎',
        color: 0xfa2d48,
    },
    vimeo: {
        label: 'Vimeo',
        emoji: '🔵',
        color: 0x1ab7ea,
    },
}

const DEFAULT_BADGE: SourceBadge = {
    label: 'Music',
    emoji: '🎵',
    color: LUCKY_MUSIC_COLOR,
}

export function detectSource(track: {
    url?: string
    source?: string | null
}): SourceBadge {
    const sourceHint = (track.source ?? '').toLowerCase()
    if (sourceHint && SOURCE_BADGES[sourceHint]) {
        return SOURCE_BADGES[sourceHint]
    }

    const url = (track.url ?? '').toLowerCase()
    if (!url) return DEFAULT_BADGE

    if (url.includes('spotify.com')) return SOURCE_BADGES.spotify
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        return SOURCE_BADGES.youtube
    }
    if (url.includes('soundcloud.com')) return SOURCE_BADGES.soundcloud
    if (url.includes('music.apple.com')) return SOURCE_BADGES.apple_music
    if (url.includes('vimeo.com')) return SOURCE_BADGES.vimeo
    return DEFAULT_BADGE
}

export type TrackEmbedKind = 'queued' | 'playing' | 'recommended' | 'history'

type TrackData = {
    title?: string
    author?: string
    url?: string
    thumbnail?: string
    duration?: string
    source?: string | null
}

function headerForKind(kind: TrackEmbedKind, badge: SourceBadge): string {
    switch (kind) {
        case 'playing':
            return `${badge.emoji} Now Playing`
        case 'queued':
            return `${badge.emoji} Queued`
        case 'recommended':
            return `${badge.emoji} Recommended`
        case 'history':
            return `${badge.emoji} From History`
    }
}

export function buildTrackEmbed(
    track: TrackData,
    kind: TrackEmbedKind,
    requestedBy?: Pick<User, 'tag' | 'displayAvatarURL'>,
): EmbedBuilder {
    const badge = detectSource(track)

    const embed = new EmbedBuilder()
        .setAuthor({ name: headerForKind(kind, badge) })
        .setColor(badge.color)
        .setTimestamp()

    if (requestedBy) {
        embed.setFooter({
            text: `Requested by ${requestedBy.tag}`,
            iconURL: requestedBy.displayAvatarURL({ size: 64 }),
        })
    }

    if (track.thumbnail) {
        embed.setThumbnail(track.thumbnail)
    }

    embed.setTitle(track.title || 'Unknown Track')
    if (track.url) embed.setURL(track.url)
    embed.setDescription(`by **${track.author || 'Unknown artist'}**`)

    const fields: { name: string; value: string; inline: boolean }[] = []
    if (track.duration && track.duration !== '0:00') {
        fields.push({ name: 'Duration', value: track.duration, inline: true })
    }
    fields.push({ name: 'Source', value: badge.label, inline: true })

    embed.addFields(fields)
    return embed
}
