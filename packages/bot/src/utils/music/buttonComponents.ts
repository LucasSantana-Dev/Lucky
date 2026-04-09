import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'
import type { GuildQueue } from 'discord-player'
import { MUSIC_BUTTON_IDS, QUEUE_BUTTON_PREFIX, LEADERBOARD_BUTTON_PREFIX } from '../../types/musicButtons'

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
