import { EmbedBuilder } from 'discord.js'
import type { Track } from 'discord-player'
import type { User } from 'discord.js'
import { COLOR } from '@lucky/shared'

export type PlayResponseKind = 'nowPlaying' | 'addedToQueue' | 'playlistQueued'

export type PlayResponseContext = {
    kind: PlayResponseKind
    track: Pick<Track, 'title' | 'author' | 'url' | 'thumbnail' | 'duration'> &
        Partial<Pick<Track, 'source'>>
    requestedBy: Pick<User, 'tag' | 'displayAvatarURL'>
    queuePosition?: number // 0-based; 0 = playing right now, n > 0 = added at position n
    playlist?: {
        title: string
        trackCount: number
        url?: string
    }
}

type SourceBadge = {
    label: string
    emoji: string
    color: number
}

const SOURCE_BADGES: Record<string, SourceBadge> = {
    spotify: {
        label: 'Spotify',
        emoji: '🟢',
        color: COLOR.SPOTIFY_GREEN,
    },
    youtube: {
        label: 'YouTube',
        emoji: '🔴',
        color: COLOR.YOUTUBE_RED,
    },
    soundcloud: {
        label: 'SoundCloud',
        emoji: '🟠',
        color: COLOR.SOUNDCLOUD_ORANGE,
    },
    apple_music: {
        label: 'Apple Music',
        emoji: '🍎',
        color: COLOR.APPLE_MUSIC_RED,
    },
    vimeo: {
        label: 'Vimeo',
        emoji: '🔵',
        color: COLOR.TIDAL_BLUE,
    },
}

const DEFAULT_BADGE: SourceBadge = {
    label: 'Music',
    emoji: '🎵',
    color: COLOR.LUCKY_PURPLE,
}

/**
 * Detect the source platform from the track URL. Discord-player's `track.source`
 * is authoritative when present but not always populated, so we fall back to
 * URL sniffing for reliability.
 */
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

function headerForKind(kind: PlayResponseKind, badge: SourceBadge): string {
    switch (kind) {
        case 'nowPlaying':
            return `${badge.emoji} Now Playing`
        case 'addedToQueue':
            return `${badge.emoji} Added to Queue`
        case 'playlistQueued':
            return `${badge.emoji} Playlist Queued`
    }
}

/**
 * Build a rich Now Playing / Added to Queue embed.
 *
 * Visual layout:
 *   Header: "🟢 Now Playing" (source-colored)
 *   Title:  **Track Title**
 *   by:     Artist Name
 *   Fields: Duration · Source · Queue Position
 *   Thumb:  track artwork
 *   Footer: Requested by <tag>
 */
export function buildPlayResponseEmbed(
    context: PlayResponseContext,
): EmbedBuilder {
    const { kind, track, requestedBy, queuePosition, playlist } = context
    const badge = detectSource(track)

    const embed = new EmbedBuilder()
        .setAuthor({ name: headerForKind(kind, badge) })
        .setColor(badge.color)
        .setTimestamp()
        .setFooter({
            text: `Requested by ${requestedBy.tag}`,
            iconURL: requestedBy.displayAvatarURL({ size: 64 }),
        })

    if (track.thumbnail) {
        embed.setThumbnail(track.thumbnail)
    }

    if (kind === 'playlistQueued' && playlist) {
        embed.setTitle(playlist.title)
        embed.setDescription(`**${playlist.trackCount}** tracks queued`)
        // Link the title to the playlist itself — never the first track's
        // URL, which would mislead the user about where the click lands.
        if (playlist.url) embed.setURL(playlist.url)
        return embed
    }

    embed.setTitle(track.title || 'Unknown Track')
    if (track.url) embed.setURL(track.url)
    embed.setDescription(`by **${track.author || 'Unknown artist'}**`)

    const fields: { name: string; value: string; inline: boolean }[] = []
    if (track.duration && track.duration !== '0:00') {
        fields.push({ name: 'Duration', value: track.duration, inline: true })
    }
    fields.push({ name: 'Source', value: badge.label, inline: true })
    if (kind === 'addedToQueue' && typeof queuePosition === 'number') {
        fields.push({
            name: 'Queue Position',
            value: `#${queuePosition}`,
            inline: true,
        })
    }

    embed.addFields(fields)
    return embed
}
