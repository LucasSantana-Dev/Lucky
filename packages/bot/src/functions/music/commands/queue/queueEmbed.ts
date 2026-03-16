import type { GuildQueue } from 'discord-player'
import {
    createEmbed,
    EMBED_COLORS,
    EMOJIS,
} from '../../../../utils/general/embeds'
import type {
    ActionRowBuilder,
    ButtonBuilder,
    ColorResolvable,
    EmbedBuilder,
} from 'discord.js'
import { calculateQueueStats, getQueueStatus } from './queueStats'
import { createTrackListDisplay, createQueueSummary } from './queueDisplay'
import type { QueueDisplayOptions } from './types'
import { createQueuePaginationButtons } from '../../../../utils/music/buttonComponents'

export type QueueEmbedResult = {
    embed: EmbedBuilder
    components: ActionRowBuilder<ButtonBuilder>[]
}

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
    page: number,
): Promise<void> {
    if (!options.showUpcomingTracks) return

    const allTracks = queue.tracks.toArray()

    if (allTracks.length > 0) {
        const trackList = await createTrackListDisplay(allTracks, options, page)
        embed.addFields({
            name: `\u{1F4CB} Upcoming Tracks (${allTracks.length})`,
            value: trackList,
            inline: false,
        })
    } else {
        embed.addFields({
            name: '\u{1F4CB} Upcoming Tracks',
            value: 'No tracks in queue',
            inline: false,
        })
    }
}

async function addQueueStats(
    embed: EmbedBuilder,
    queue: GuildQueue,
    options: QueueDisplayOptions,
): Promise<void> {
    if (!options.showQueueStats) return

    const stats = await calculateQueueStats(queue)
    const summary = createQueueSummary(
        stats.totalTracks,
        stats.totalDuration,
        stats.currentPosition,
    )

    embed.addFields({
        name: '\u{1F4CA} Queue Statistics',
        value: summary,
        inline: true,
    })

    const status = getQueueStatus(queue)
    embed.addFields({
        name: '\u{1F39B}\uFE0F Status',
        value: status,
        inline: true,
    })
}

export async function createQueueEmbed(
    queue: GuildQueue,
    options: QueueDisplayOptions = {
        showCurrentTrack: true,
        showUpcomingTracks: true,
        maxTracksToShow: 10,
        showTotalDuration: true,
        showQueueStats: true,
    },
    page = 0,
): Promise<QueueEmbedResult> {
    const embed = createEmbed({
        title: '\u{1F4C4} Music Queue',
        color: EMBED_COLORS.QUEUE as ColorResolvable,
        timestamp: true,
    })

    addCurrentTrackInfo(embed, queue, options)
    await addUpcomingTracks(embed, queue, options, page)
    await addQueueStats(embed, queue, options)

    const totalTracks = queue.tracks.size
    const totalPages = Math.ceil(totalTracks / options.maxTracksToShow)
    const components: ActionRowBuilder<ButtonBuilder>[] = []
    const paginationRow = createQueuePaginationButtons(page, totalPages)
    if (paginationRow) components.push(paginationRow)

    return { embed, components }
}

export function createEmptyQueueEmbed() {
    return createEmbed({
        title: '\u{1F4C4} Music Queue',
        description: 'The queue is empty. Add some tracks to get started!',
        color: EMBED_COLORS.QUEUE as ColorResolvable,
        emoji: EMOJIS.QUEUE,
        timestamp: true,
    })
}

export function createQueueErrorEmbed(error: string) {
    return createEmbed({
        title: '\u274C Queue Error',
        description: error,
        color: EMBED_COLORS.ERROR as ColorResolvable,
        emoji: EMOJIS.ERROR,
        timestamp: true,
    })
}
