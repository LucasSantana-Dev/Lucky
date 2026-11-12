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
import { calculateQueueStats } from './queueStats'
import { createTrackListDisplay } from './queueDisplay'
import type { QueueDisplayOptions } from './types'
import {
    createQueuePaginationButtons,
    createMusicControlButtons,
} from '../../../../utils/music/buttonComponents'
import {
    escapeTitleBrackets,
    escapeTrackText,
    hasKnownDuration,
} from '../../../../utils/music/nowPlayingEmbed'

export type QueueEmbedResult = {
    embed: EmbedBuilder
    components: ActionRowBuilder<ButtonBuilder>[]
}

/** Embed descriptions cap at 4096 characters. */
const DESCRIPTION_LIMIT = 4096

function currentTrackSection(queue: GuildQueue, t: TFunction): string | null {
    const { currentTrack } = queue
    if (!currentTrack) return null
    const metadata = (currentTrack.metadata ?? {}) as { isAutoplay?: boolean }
    const title = escapeTitleBrackets(currentTrack.title || '')
    const line = [
        currentTrack.url ? `[${title}](${currentTrack.url})` : title,
        escapeTrackText(currentTrack.author || ''),
        hasKnownDuration(currentTrack.duration) ? currentTrack.duration : '',
        metadata.isAutoplay
            ? t('music.queue.autoplayTag')
            : currentTrack.requestedBy &&
              escapeTrackText(currentTrack.requestedBy.username),
    ]
        .filter(Boolean)
        .join(' · ')
    return `**${t('music.queue.nowPlaying')}**\n${line}`
}

async function upcomingSection(
    queue: GuildQueue,
    options: QueueDisplayOptions,
    page: number,
    t: TFunction,
): Promise<string> {
    const allTracks = queue.tracks.toArray()
    if (allTracks.length === 0) return t('music.queue.noTracks')
    const trackList = await createTrackListDisplay(allTracks, options, page, t)
    return trackList || t('music.queue.noDisplayableTracks')
}

/**
 * One compact card: the track playing now, a numbered list of what comes
 * next, and "N songs in queue • Total duration" in the footer. The player
 * controls live on the now-playing message; this card keeps one row of them
 * plus the page buttons.
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
    page = 0,
    t: TFunction,
): Promise<QueueEmbedResult> {
    const embed = createEmbed({
        title: t('music.queue.title'),
        color: EMBED_COLORS.QUEUE as ColorResolvable,
    })

    const sections: string[] = []
    const current = options.showCurrentTrack
        ? currentTrackSection(queue, t)
        : null
    if (current) sections.push(current)
    if (options.showUpcomingTracks) {
        sections.push(await upcomingSection(queue, options, page, t))
    }
    const description = sections.join('\n\n')
    if (description) {
        embed.setDescription(
            description.length > DESCRIPTION_LIMIT
                ? `${description.slice(0, DESCRIPTION_LIMIT - 1)}…`
                : description,
        )
    }

    if (options.showQueueStats) {
        const stats = await calculateQueueStats(queue)
        embed.setFooter({
            text: t('music.queue.footer', {
                count: stats.totalTracks,
                duration: stats.totalDuration,
            }),
        })
    }

    const totalPages = Math.ceil(queue.tracks.size / options.maxTracksToShow)
    const components: ActionRowBuilder<ButtonBuilder>[] = [
        createMusicControlButtons(queue),
    ]
    const paginationRow = createQueuePaginationButtons(page, totalPages)
    if (paginationRow) components.push(paginationRow)

    return { embed, components }
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
