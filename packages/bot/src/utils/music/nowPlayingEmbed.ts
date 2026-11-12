import { EmbedBuilder, escapeMarkdown } from 'discord.js'
import type { Track } from 'discord-player'
import type { User } from 'discord.js'
import type { TFunction } from 'i18next'
import { COLOR } from '@lucky/shared/constants'
import { isHost } from '../general/urlHost'
import { MUSIC_ACTION_STYLE, type MusicAction } from './musicActionStyle'

export type PlayResponseKind = 'nowPlaying' | 'addedToQueue' | 'playlistQueued'

export type PlayResponseContext = {
    kind: PlayResponseKind
    track: Pick<Track, 'title' | 'author' | 'url' | 'thumbnail' | 'duration'> &
        Partial<Pick<Track, 'source'>>
    requestedBy: Pick<User, 'tag'>
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

    const url = track.url ?? ''
    if (!url) return DEFAULT_BADGE

    if (isHost(url, 'spotify.com')) return SOURCE_BADGES.spotify
    if (isHost(url, 'youtube.com') || isHost(url, 'youtu.be')) {
        return SOURCE_BADGES.youtube
    }
    if (isHost(url, 'soundcloud.com')) return SOURCE_BADGES.soundcloud
    if (isHost(url, 'music.apple.com')) return SOURCE_BADGES.apple_music
    if (isHost(url, 'vimeo.com')) return SOURCE_BADGES.vimeo
    return DEFAULT_BADGE
}

const ACTION_OF_KIND: Record<PlayResponseKind, MusicAction> = {
    nowPlaying: 'nowPlaying',
    addedToQueue: 'queued',
    playlistQueued: 'playlistQueued',
}

/**
 * Escapes markdown and the link brackets a title like "Song [Official Video]"
 * carries. Backslashes and brackets are escaped here, first, so escapeMarkdown
 * runs with its own backslash pass off and never escapes the ones added here.
 */
export function escapeTrackText(text: string): string {
    return escapeMarkdown(text.replace(/[\\[\]]/g, '\\$&'), { escape: false })
}

export function hasKnownDuration(duration?: string | null): duration is string {
    return Boolean(duration) && duration !== '0:00'
}

/** One line: linked bold title, artist and duration. Without `t` the
 * unknown-title fallbacks are English (callers not localized yet). */
export function formatTrackLine(
    track: {
        title?: string | null
        author?: string | null
        url?: string | null
        duration?: string | null
    },
    t?: TFunction,
): string {
    const title = `**${escapeTrackText(track.title || (t ? t('music.messages.unknownTrack') : 'Unknown track'))}**`
    const linked = track.url ? `[${title}](${track.url})` : title
    const author = escapeTrackText(
        track.author ||
            (t ? t('music.messages.unknownArtist') : 'Unknown artist'),
    )
    const duration = hasKnownDuration(track.duration)
        ? ` (${track.duration})`
        : ''
    return `${linked} · ${author}${duration}`
}

export function capitalizeFirst(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * The one-line /play reply: "<emoji> Queued <title> · <artist> (6:44)" with
 * the queue position and requester in the footer. Colored by the action, not
 * the source (#2998).
 */
export function buildPlayResponseEmbed(
    context: PlayResponseContext,
    t: TFunction,
): EmbedBuilder {
    const { kind, track, requestedBy, queuePosition, playlist } = context
    const style = MUSIC_ACTION_STYLE[ACTION_OF_KIND[kind]]
    const requester = t('music.messages.requestedBy', {
        user: requestedBy.tag,
    })
    const embed = new EmbedBuilder().setColor(style.color)

    if (kind === 'playlistQueued' && playlist) {
        const name = `**${escapeTrackText(playlist.title)}**`
        // Link the playlist itself, never the first track's URL.
        const linked = playlist.url ? `[${name}](${playlist.url})` : name
        embed.setDescription(
            `${style.emoji} ${t('music.messages.playlist')} ${linked} · ${t(
                'music.messages.playlistTracks',
                { count: playlist.trackCount },
            )}`,
        )
        return embed.setFooter({ text: capitalizeFirst(requester) })
    }

    const label =
        kind === 'nowPlaying'
            ? t('music.messages.nowPlaying')
            : t('music.messages.queued')
    embed.setDescription(`${style.emoji} ${label} ${formatTrackLine(track, t)}`)

    const footer =
        kind === 'addedToQueue' &&
        typeof queuePosition === 'number' &&
        queuePosition > 0
            ? `${t('music.messages.position', { position: queuePosition })} · ${requester}`
            : requester
    return embed.setFooter({ text: capitalizeFirst(footer) })
}
