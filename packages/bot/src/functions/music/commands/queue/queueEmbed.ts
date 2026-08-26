import type { GuildQueue } from 'discord-player'
import type { TFunction } from 'i18next'
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
import {
    createQueuePaginationButtons,
    createMusicControlButtons,
    createMusicActionButtons,
} from '../../../../utils/music/buttonComponents'

export type QueueEmbedResult = {
    embed: EmbedBuilder
    components: ActionRowBuilder<ButtonBuilder>[]
}

function addCurrentTrackInfo(
    embed: EmbedBuilder,
    queue: GuildQueue,
    options: QueueDisplayOptions,
    t: TFunction,
): void {
    if (options.showCurrentTrack && queue.currentTrack) {
        const { currentTrack } = queue
        const metadata = (currentTrack.metadata ?? {}) as {
            isAutoplay?: boolean
            recommendationReason?: string
        }
        const reasonLine =
            metadata.isAutoplay && metadata.recommendationReason
                ? t('music.queue.recommendedBecause', {
                      reason: metadata.recommendationReason,
                  })
                : ''
        embed.addFields({
            name: t('music.queue.nowPlaying'),
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
    t: TFunction,
): Promise<void> {
    if (!options.showUpcomingTracks) return

    const allTracks = queue.tracks.toArray()

    if (allTracks.length > 0) {
        const trackList = await createTrackListDisplay(allTracks, options, page)
        const raw = trackList || t('music.queue.noDisplayableTracks')
        const value = raw.length > 1024 ? raw.slice(0, 1021) + '…' : raw
        embed.addFields({
            name: t('music.queue.upcomingTracksCount', {
                count: allTracks.length,
            }),
            value,
            inline: false,
        })
    } else {
        embed.addFields({
            name: t('music.queue.upcomingTracks'),
            value: t('music.queue.noTracks'),
            inline: false,
        })
    }
}

async function addQueueStats(
    embed: EmbedBuilder,
    queue: GuildQueue,
    options: QueueDisplayOptions,
    t: TFunction,
): Promise<void> {
    if (!options.showQueueStats) return

    const stats = await calculateQueueStats(queue)
    const summary = createQueueSummary(
        stats.totalTracks,
        stats.totalDuration,
        stats.currentPosition,
    )

    embed.addFields({
        name: t('music.queue.statistics'),
        value: summary,
        inline: true,
    })

    const status = getQueueStatus(queue)
    embed.addFields({
        name: t('music.queue.status'),
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
    t: TFunction,
): Promise<QueueEmbedResult> {
    const embed = createEmbed({
        title: t('music.queue.title'),
        color: EMBED_COLORS.QUEUE as ColorResolvable,
        timestamp: true,
    })

    addCurrentTrackInfo(embed, queue, options, t)
    await addUpcomingTracks(embed, queue, options, page, t)
    await addQueueStats(embed, queue, options, t)

    const totalTracks = queue.tracks.size
    const totalPages = Math.ceil(totalTracks / options.maxTracksToShow)
    const components: ActionRowBuilder<ButtonBuilder>[] = []

    components.push(createMusicControlButtons(queue))
    components.push(createMusicActionButtons(queue))

    // Add pagination buttons if needed
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

export function createQueueErrorEmbed(error: string, t: TFunction) {
    return createEmbed({
        title: t('music.queue.errorTitle'),
        description: error,
        color: EMBED_COLORS.ERROR as ColorResolvable,
        emoji: EMOJIS.ERROR,
        timestamp: true,
    })
}
