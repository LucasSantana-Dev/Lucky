import { EMBED_COLORS, EMOJIS } from './constants'
import { createEmbed } from './core'
import type { TrackInfo, QueueInfo } from './types'

export function musicEmbed(title: string, description?: string) {
    return createEmbed({
        title,
        description,
        color: EMBED_COLORS.MUSIC,
        emoji: EMOJIS.MUSIC,
    })
}

export function queueEmbed(title: string, description?: string) {
    return createEmbed({
        title,
        description,
        color: EMBED_COLORS.QUEUE,
        emoji: EMOJIS.QUEUE,
    })
}

export function autoplayEmbed(title: string, description?: string) {
    return createEmbed({
        title,
        description,
        color: EMBED_COLORS.AUTOPLAY,
        emoji: EMOJIS.AUTOPLAY,
    })
}

export function createTrackEmbed(track: TrackInfo) {
    const fields = [
        {
            name: 'Duration',
            value: track.duration ?? 'Unknown',
            inline: true,
        },
        {
            name: 'Requested by',
            value: track.requestedBy ?? 'Unknown',
            inline: true,
        },
    ]

    if (track.source) {
        fields.push({
            name: 'Source',
            value: track.source,
            inline: true,
        })
    }

    return createEmbed({
        title: track.title,
        description: `by ${track.author}`,
        url: track.url,
        thumbnail: track.thumbnail,
        color: EMBED_COLORS.MUSIC,
        emoji: EMOJIS.MUSIC,
        fields,
        timestamp: true,
    })
}

export function createQueueEmbed(queueInfo: QueueInfo) {
    const {
        currentTrack,
        tracks,
        totalDuration,
        isLooping,
        isShuffled,
        autoplayEnabled,
    } = queueInfo

    const fields = []

    if (currentTrack) {
        fields.push({
            name: 'Now Playing',
            value: `[${currentTrack.title}](${currentTrack.url})`,
            inline: false,
        })
    }

    if (tracks.length > 0) {
        const trackList = tracks
            .slice(0, 10)
            .map(
                (track, index) =>
                    `${index + 1}. [${track.title}](${track.url})`,
            )
            .join('\n')

        fields.push({
            name: `Queue (${tracks.length} tracks)`,
            value:
                trackList +
                (tracks.length > 10
                    ? `\n... and ${tracks.length - 10} more`
                    : ''),
            inline: false,
        })
    }

    if (totalDuration) {
        fields.push({
            name: 'Total Duration',
            value: totalDuration,
            inline: true,
        })
    }

    const statusFields = []
    if (isLooping) statusFields.push('🔁 Loop')
    if (isShuffled) statusFields.push('🔀 Shuffle')
    if (autoplayEnabled) statusFields.push('🔄 Autoplay')

    if (statusFields.length > 0) {
        fields.push({
            name: 'Status',
            value: statusFields.join(' • '),
            inline: true,
        })
    }

    return createEmbed({
        title: 'Music Queue',
        description: tracks.length === 0 ? 'Queue is empty' : undefined,
        color: EMBED_COLORS.QUEUE,
        emoji: EMOJIS.QUEUE,
        fields,
        timestamp: true,
    })
}
