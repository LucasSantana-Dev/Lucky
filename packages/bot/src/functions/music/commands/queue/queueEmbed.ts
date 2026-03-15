import type { GuildQueue } from 'discord-player'
import {
    createEmbed,
    EMBED_COLORS,
    EMOJIS,
} from '../../../../utils/general/embeds'
import type { ColorResolvable, EmbedBuilder } from 'discord.js'
import { calculateQueueStats, getQueueStatus } from './queueStats'
import { createTrackListDisplay, createQueueSummary } from './queueDisplay'
import type { QueueDisplayOptions } from './types'

function addCurrentTrackInfo(
    embed: EmbedBuilder,
    queue: GuildQueue,
    options: QueueDisplayOptions,
): void {
    if (options.showCurrentTrack && queue.currentTrack) {
        const { currentTrack } = queue
        const metadata = (currentTrack.metadata ?? {}) as {
            isAutoplay?: boolean
            recommendationReason?: string
        }
        const reasonLine =
            metadata.isAutoplay && metadata.recommendationReason
                ? `\nRecommended because: _${metadata.recommendationReason}_`
                : ''
        embed.addFields({
            name: '\u{1f3b5} Now Playing',
            value: `[${currentTrack.title}](${currentTrack.url}) by **${currentTrack.author}**${reasonLine}`,
            inline: false,
        })

        if (currentTrack.thumbnail) {
            embed.setThumbnail(currentTrack.thumbnail)
        }
    }
}

async function addUpcomingTracks(
    embed: EmbedBuilder,
    queue: GuildQueue,
    options: QueueDisplayOptions,
): Promise<void> {
    if (options.showUpcomingTracks) {
        const upcomingTracks = queue.tracks.toArray()

        if (upcomingTracks.length > 0) {
            const trackList = await createTrackListDisplay(
                upcomingTracks,
                options,
            )
            embed.addFields({
                name: `📋 Upcoming Tracks (${upcomingTracks.length})`,
                value: trackList,
                inline: false,
            })
        } else {
            embed.addFields({
                name: '📋 Upcoming Tracks',
                value: 'No tracks in queue',
                inline: false,
            })
        }
    }
}

async function addQueueStats(
    embed: EmbedBuilder,
    queue: GuildQueue,
    options: QueueDisplayOptions,
): Promise<void> {
    if (options.showQueueStats) {
        const stats = await calculateQueueStats(queue)
        const summary = createQueueSummary(
            stats.totalTracks,
            stats.totalDuration,
            stats.currentPosition,
        )

        embed.addFields({
            name: '📊 Queue Statistics',
            value: summary,
            inline: true,
        })

        const status = getQueueStatus(queue)
        embed.addFields({
            name: '🎛️ Status',
            value: status,
            inline: true,
        })
    }
}

/**
 * Create the main queue embed
 */
export async function createQueueEmbed(
    queue: GuildQueue,
    options: QueueDisplayOptions = {
        showCurrentTrack: true,
        showUpcomingTracks: true,
        maxTracksToShow: 10,
        showTotalDuration: true,
        showQueueStats: true,
    },
) {
    const embed = createEmbed({
        title: '📄 Music Queue',
        color: EMBED_COLORS.QUEUE as ColorResolvable,
        timestamp: true,
    })

    addCurrentTrackInfo(embed, queue, options)
    await addUpcomingTracks(embed, queue, options)
    await addQueueStats(embed, queue, options)

    return embed
}

/**
 * Create an empty queue embed
 */
export function createEmptyQueueEmbed() {
    return createEmbed({
        title: '📄 Music Queue',
        description: 'The queue is empty. Add some tracks to get started!',
        color: EMBED_COLORS.QUEUE as ColorResolvable,
        emoji: EMOJIS.QUEUE,
        timestamp: true,
    })
}

/**
 * Create a queue error embed
 */
export function createQueueErrorEmbed(error: string) {
    return createEmbed({
        title: '❌ Queue Error',
        description: error,
        color: EMBED_COLORS.ERROR as ColorResolvable,
        emoji: EMOJIS.ERROR,
        timestamp: true,
    })
}
