import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'
import type { GuildQueue } from 'discord-player'
import { QueueRepeatMode } from 'discord-player'
import {
    MUSIC_BUTTON_IDS,
    QUEUE_BUTTON_PREFIX,
    LEADERBOARD_BUTTON_PREFIX,
} from '../../types/musicButtons'

export function createMusicControlButtons(
    queue: GuildQueue,
): ActionRowBuilder<ButtonBuilder> {
    const isPaused = queue.node.isPaused()
    const hasHistory = queue.history.tracks.data.length > 0
    const canShuffle = queue.tracks.size >= 2

    const previousButton = new ButtonBuilder()
        .setCustomId(MUSIC_BUTTON_IDS.PREVIOUS)
        .setEmoji('⏮️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!hasHistory)

    const pauseResumeButton = new ButtonBuilder()
        .setCustomId(MUSIC_BUTTON_IDS.PAUSE_RESUME)
        .setLabel(isPaused ? 'Resume' : 'Pause')
        .setEmoji('⏯️')
        .setStyle(ButtonStyle.Primary)

    const skipButton = new ButtonBuilder()
        .setCustomId(MUSIC_BUTTON_IDS.SKIP)
        .setEmoji('⏭️')
        .setStyle(ButtonStyle.Secondary)

    const shuffleButton = new ButtonBuilder()
        .setCustomId(MUSIC_BUTTON_IDS.SHUFFLE)
        .setEmoji('🔀')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!canShuffle)

    const loopButton = new ButtonBuilder()
        .setCustomId(MUSIC_BUTTON_IDS.LOOP)
        .setEmoji('🔁')
        .setStyle(ButtonStyle.Secondary)

    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        previousButton,
        pauseResumeButton,
        skipButton,
        shuffleButton,
        loopButton,
    )
}

export function createMusicActionButtons(
    queue: GuildQueue,
): ActionRowBuilder<ButtonBuilder> {
    const isAutoplay = queue.repeatMode === QueueRepeatMode.AUTOPLAY

    const stopButton = new ButtonBuilder()
        .setCustomId(MUSIC_BUTTON_IDS.STOP)
        .setEmoji('⏹️')
        .setLabel('Stop')
        .setStyle(ButtonStyle.Danger)

    const clearQueueButton = new ButtonBuilder()
        .setCustomId(MUSIC_BUTTON_IDS.CLEAR_QUEUE)
        .setEmoji('🗑️')
        .setLabel('Clear')
        .setStyle(ButtonStyle.Secondary)

    const clearAutoplayButton = new ButtonBuilder()
        .setCustomId(MUSIC_BUTTON_IDS.CLEAR_AUTOPLAY)
        .setEmoji('🤖')
        .setLabel('Clear Autoplay')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!isAutoplay)

    // Thumbs feedback (#2658): rates the track playing now for autoplay.
    const likeButton = new ButtonBuilder()
        .setCustomId(MUSIC_BUTTON_IDS.LIKE)
        .setEmoji('👍')
        .setStyle(ButtonStyle.Secondary)

    const dislikeButton = new ButtonBuilder()
        .setCustomId(MUSIC_BUTTON_IDS.DISLIKE)
        .setEmoji('👎')
        .setStyle(ButtonStyle.Secondary)

    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        stopButton,
        clearQueueButton,
        clearAutoplayButton,
        likeButton,
        dislikeButton,
    )
}

/**
 * The single row on the now-playing message: pause/resume, skip, thumbs and
 * a "More" button that opens the full controls for the clicker only.
 */
export function createNowPlayingButtons(
    queue: GuildQueue,
    moreLabel: string,
): ActionRowBuilder<ButtonBuilder> {
    const isPaused = queue.node.isPaused()

    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.PAUSE_RESUME)
            .setEmoji(isPaused ? '▶️' : '⏸️')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.SKIP)
            .setEmoji('⏭️')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.LIKE)
            .setEmoji('👍')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.DISLIKE)
            .setEmoji('👎')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.MORE_CONTROLS)
            .setEmoji('🎛️')
            .setLabel(moreLabel)
            .setStyle(ButtonStyle.Secondary),
    )
}

type MessageRowLike = {
    components: readonly { customId?: string | null; label?: string | null }[]
}

/**
 * Rebuilds the music rows of a message after a button changed the player
 * state, keeping each message's own layout: the compact now-playing row stays
 * compact and rows the music buttons do not own (queue pages) stay as they
 * are. A message without rows gets the full two-row panel.
 */
export function refreshMusicComponents(
    rows: readonly MessageRowLike[] | undefined,
    queue: GuildQueue,
): ActionRowBuilder<ButtonBuilder>[] {
    if (!rows?.length) {
        return [
            createMusicControlButtons(queue),
            createMusicActionButtons(queue),
        ]
    }
    return rows.map((row) => {
        const more = row.components.find(
            (c) => c.customId === MUSIC_BUTTON_IDS.MORE_CONTROLS,
        )
        if (more) return createNowPlayingButtons(queue, more.label ?? '')
        const ids = row.components.map((c) => c.customId)
        if (ids.includes(MUSIC_BUTTON_IDS.PAUSE_RESUME)) {
            return createMusicControlButtons(queue)
        }
        if (ids.includes(MUSIC_BUTTON_IDS.STOP)) {
            return createMusicActionButtons(queue)
        }
        return ActionRowBuilder.from<ButtonBuilder>(row as never)
    })
}

export function createQueuePaginationButtons(
    currentPage: number,
    totalPages: number,
): ActionRowBuilder<ButtonBuilder> | null {
    if (totalPages <= 1) {
        return null
    }

    const isFirstPage = currentPage === 0
    const isLastPage = currentPage === totalPages - 1

    const previousButton = new ButtonBuilder()
        .setCustomId(`${QUEUE_BUTTON_PREFIX}_${currentPage - 1}`)
        .setEmoji('◀️')
        .setLabel('Previous Page')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(isFirstPage)

    const pageIndicatorButton = new ButtonBuilder()
        .setCustomId('page_indicator')
        .setLabel(`Page ${currentPage + 1}/${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)

    const nextButton = new ButtonBuilder()
        .setCustomId(`${QUEUE_BUTTON_PREFIX}_${currentPage + 1}`)
        .setEmoji('▶️')
        .setLabel('Next Page')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(isLastPage)

    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        previousButton,
        pageIndicatorButton,
        nextButton,
    )
}

export function createLeaderboardPaginationButtons(
    currentPage: number,
    totalPages: number,
): ActionRowBuilder<ButtonBuilder> | null {
    if (totalPages <= 1) {
        return null
    }

    const isFirstPage = currentPage === 0
    const isLastPage = currentPage === totalPages - 1

    const previousButton = new ButtonBuilder()
        .setCustomId(`${LEADERBOARD_BUTTON_PREFIX}_${currentPage - 1}`)
        .setEmoji('◀️')
        .setLabel('Previous Page')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(isFirstPage)

    const pageIndicatorButton = new ButtonBuilder()
        .setCustomId('leaderboard_page_indicator')
        .setLabel(`Page ${currentPage + 1}/${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)

    const nextButton = new ButtonBuilder()
        .setCustomId(`${LEADERBOARD_BUTTON_PREFIX}_${currentPage + 1}`)
        .setEmoji('▶️')
        .setLabel('Next Page')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(isLastPage)

    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        previousButton,
        pageIndicatorButton,
        nextButton,
    )
}
