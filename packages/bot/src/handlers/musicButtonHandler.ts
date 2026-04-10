import { type ButtonInteraction, type GuildMember } from 'discord.js'
import { QueueRepeatMode } from 'discord-player'
import { debugLog, errorLog } from '@lucky/shared/utils'
import { createErrorEmbed } from '../utils/general/embeds'
import {
    MUSIC_BUTTON_IDS,
    QUEUE_BUTTON_PREFIX,
    LEADERBOARD_BUTTON_PREFIX,
} from '../types/musicButtons'
import {
    createMusicControlButtons,
    createLeaderboardPaginationButtons,
} from '../utils/music/buttonComponents'
import { createQueueEmbed } from '../functions/music/commands/queue/queueEmbed'
import { shuffleQueue } from '../utils/music/queueManipulation'
import type { GuildQueue } from 'discord-player'
import { resolveGuildQueue } from '../utils/music/queueResolver'
import type { CustomClient } from '../types'
import { buildListPageEmbed } from '../utils/general/responseEmbeds'
import { levelService } from '@lucky/shared/services'

type NonNullQueue = GuildQueue

export async function handleMusicButtonInteraction(
    interaction: ButtonInteraction,
): Promise<void> {
    try {
        const member = interaction.member as GuildMember
        if (!member.voice.channel) {
            await interaction.reply({
                embeds: [
                    createErrorEmbed(
                        'Not in Voice',
                        'Join a voice channel first',
                    ),
                ],
                ephemeral: true,
            })
            return
        }

        const { queue, source, diagnostics } = resolveGuildQueue(
            interaction.client as unknown as Pick<CustomClient, 'player'>,
            interaction.guildId!,
        )
        if (!queue) {
            debugLog({
                message: 'Music button interaction could not resolve queue',
                data: {
                    customId: interaction.customId,
                    guildId: interaction.guildId,
                    source,
                    diagnostics,
                },
            })
            await interaction.reply({
                embeds: [
                    createErrorEmbed(
                        'No Music',
                        'Nothing is playing right now',
                    ),
                ],
                ephemeral: true,
            })
            return
        }

        await interaction.deferUpdate()
        await routeButtonAction(interaction, queue)
    } catch (error) {
        errorLog({
            message: 'Music button interaction error',
            error,
        })
        if (!interaction.replied && !interaction.deferred) {
            await interaction
                .reply({
                    embeds: [createErrorEmbed('Error', 'Something went wrong')],
                    ephemeral: true,
                })
                .catch(() => {})
        } else if (interaction.deferred) {
            await interaction
                .editReply({
                    embeds: [createErrorEmbed('Error', 'Something went wrong')],
                })
                .catch(() => {})
        }
    }
}

async function routeButtonAction(
    interaction: ButtonInteraction,
    queue: NonNullQueue,
): Promise<void> {
    const { customId } = interaction

    switch (customId) {
        case MUSIC_BUTTON_IDS.PREVIOUS:
            return handlePrevious(interaction, queue)
        case MUSIC_BUTTON_IDS.PAUSE_RESUME:
            return handlePauseResume(interaction, queue)
        case MUSIC_BUTTON_IDS.SKIP:
            return handleSkip(interaction, queue)
        case MUSIC_BUTTON_IDS.SHUFFLE:
            return handleShuffle(interaction, queue)
        case MUSIC_BUTTON_IDS.LOOP:
            return handleLoop(interaction, queue)
        default:
            if (customId.startsWith(QUEUE_BUTTON_PREFIX)) {
                return handleQueuePage(interaction, queue)
            }
            if (customId.startsWith(LEADERBOARD_BUTTON_PREFIX)) {
                return handleLeaderboardPage(interaction)
            }
    }
}

async function handlePrevious(
    interaction: ButtonInteraction,
    queue: NonNullQueue,
): Promise<void> {
    await queue.history.back()
    debugLog({ message: 'Previous track via button' })
}

async function handlePauseResume(
    interaction: ButtonInteraction,
    queue: NonNullQueue,
): Promise<void> {
    if (queue.node.isPaused()) {
        queue.node.resume()
    } else {
        queue.node.pause()
    }

    await interaction.editReply({
        components: [createMusicControlButtons(queue)],
    })
}

async function handleSkip(
    interaction: ButtonInteraction,
    queue: NonNullQueue,
): Promise<void> {
    queue.node.skip()
    debugLog({ message: 'Track skipped via button' })
}

async function handleShuffle(
    interaction: ButtonInteraction,
    queue: NonNullQueue,
): Promise<void> {
    await shuffleQueue(queue)
    debugLog({ message: 'Queue shuffled via button' })
}

const LOOP_MODE_NAMES: Record<number, string> = {
    [QueueRepeatMode.OFF]: 'Off',
    [QueueRepeatMode.TRACK]: 'Track',
    [QueueRepeatMode.QUEUE]: 'Queue',
    [QueueRepeatMode.AUTOPLAY]: 'Autoplay',
}

const LOOP_MODE_ORDER = [
    QueueRepeatMode.OFF,
    QueueRepeatMode.TRACK,
    QueueRepeatMode.QUEUE,
    QueueRepeatMode.AUTOPLAY,
]

async function handleLoop(
    interaction: ButtonInteraction,
    queue: NonNullQueue,
): Promise<void> {
    const currentIdx = LOOP_MODE_ORDER.indexOf(queue.repeatMode)
    const nextIdx = (currentIdx + 1) % LOOP_MODE_ORDER.length
    const newMode = LOOP_MODE_ORDER[nextIdx]
    queue.setRepeatMode(newMode)

    const modeName = LOOP_MODE_NAMES[newMode] ?? 'Off'
    await interaction.followUp({
        content: `\u{1F501} Loop mode: **${modeName}**`,
        ephemeral: true,
    })
}

async function handleQueuePage(
    interaction: ButtonInteraction,
    queue: NonNullQueue,
): Promise<void> {
    const pageMatch = interaction.customId.match(/queue_page_(\d+)/)
    if (!pageMatch?.[1]) return

    const page = parseInt(pageMatch[1], 10)
    const { embed, components } = await createQueueEmbed(queue, undefined, page)

    await interaction.editReply({
        embeds: [embed],
        components,
    })
    debugLog({ message: `Queue page: ${page}` })
}

async function handleLeaderboardPage(
    interaction: ButtonInteraction,
): Promise<void> {
    try {
        const pageMatch = interaction.customId.match(/leaderboard_page_(\d+)/)
        if (!pageMatch?.[1] || !interaction.guildId) return

        const page = parseInt(pageMatch[1], 10)
        const entries = await levelService.getLeaderboard(
            interaction.guildId,
            50,
        )

        if (entries.length === 0) {
            await interaction.editReply({
                embeds: [
                    createErrorEmbed('Leaderboard', 'No XP recorded yet.'),
                ],
                components: [],
            })
            return
        }

        const listItems = entries.map(
            (e: { userId: string; level: number; xp: number }, i: number) => ({
                name: `#${i + 1}`,
                value: `<@${e.userId}> — Level ${e.level} (${e.xp} XP)`,
            }),
        )

        const itemsPerPage = 5
        const totalPages = Math.ceil(listItems.length / itemsPerPage)

        const embed = buildListPageEmbed(listItems, page + 1, {
            title: 'XP Leaderboard',
            itemsPerPage,
        })

        const components = []
        const paginationRow = createLeaderboardPaginationButtons(
            page,
            totalPages,
        )
        if (paginationRow) {
            components.push(paginationRow)
        }

        await interaction.editReply({
            embeds: [embed],
            components,
        })
        debugLog({ message: `Leaderboard page: ${page}` })
    } catch (error) {
        errorLog({
            message: 'Error handling leaderboard page interaction',
            error,
        })
        await interaction
            .followUp({
                embeds: [createErrorEmbed('Error', 'Something went wrong')],
                ephemeral: true,
            })
            .catch(() => {})
    }
}
