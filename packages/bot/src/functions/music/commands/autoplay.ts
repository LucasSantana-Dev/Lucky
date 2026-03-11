import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import {
    createEmbed,
    EMBED_COLORS,
    EMOJIS,
} from '../../../utils/general/embeds'
import { errorLog, debugLog } from '@lucky/shared/utils'
import { QueueRepeatMode, type GuildQueue } from 'discord-player'
import {
    requireGuild,
    requireQueue,
} from '../../../utils/command/commandValidations'
import type { CommandExecuteParams } from '../../../types/CommandData'
import { messages } from '../../../utils/general/messages'
import type { ColorResolvable, ChatInputCommandInteraction } from 'discord.js'
import { replenishQueue } from '../../../utils/music/trackManagement/queueOperations'

type QueueNodeCache = {
    values: () => Iterable<GuildQueue | null | undefined>
}

function resolveGuildQueue(
    client: CommandExecuteParams['client'],
    guildId: string,
): GuildQueue | null {
    const queue = client.player.nodes.get(guildId)
    if (queue) {
        return queue
    }

    const nodeCache = (
        client.player as {
            nodes?: { cache?: QueueNodeCache }
        }
    )?.nodes?.cache

    if (!nodeCache?.values) {
        return null
    }

    for (const node of nodeCache.values()) {
        if (node?.guild?.id === guildId) {
            debugLog({
                message: 'Recovered autoplay queue from node cache fallback',
                data: { guildId },
            })
            return node
        }
    }

    return null
}

/**
 * Handle disabling autoplay
 */
async function handleDisableAutoplay(
    queue: GuildQueue | null,
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    queue?.setRepeatMode(QueueRepeatMode.OFF)

    await interactionReply({
        interaction,
        content: {
            embeds: [
                createEmbed({
                    title: 'Autoplay disabled',
                    description:
                        'Autoplay has been disabled. The bot will no longer automatically add related songs.',
                    color: EMBED_COLORS.AUTOPLAY as ColorResolvable,
                    emoji: EMOJIS.AUTOPLAY,
                    timestamp: true,
                }),
            ],
        },
    })
}

/**
 * Handle enabling autoplay and populating queue
 */
async function handleEnableAutoplay(
    queue: GuildQueue | null,
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    queue?.setRepeatMode(QueueRepeatMode.AUTOPLAY)

    if (queue?.currentTrack) {
        await populateQueueWithRelatedTracks(queue, interaction)
    }

    await interactionReply({
        interaction,
        content: {
            embeds: [
                createEmbed({
                    title: 'Autoplay enabled',
                    description:
                        'Autoplay has been enabled. The bot will automatically add related songs when the queue is empty.',
                    color: EMBED_COLORS.AUTOPLAY as ColorResolvable,
                    emoji: EMOJIS.AUTOPLAY,
                    timestamp: true,
                }),
            ],
        },
    })
}

/**
 * Populate queue with related tracks
 */
async function populateQueueWithRelatedTracks(
    queue: GuildQueue,
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    debugLog({
        message:
            'Autoplay enabled, attempting to populate queue with related tracks',
        data: {
            guildId: interaction.guildId,
            currentTrack: queue.currentTrack?.title,
        },
    })

    try {
        await replenishQueue(queue)
        debugLog({
            message: 'Queue replenished after enabling autoplay',
            data: {
                guildId: interaction.guildId,
                queueSize: queue.tracks.size,
            },
        })
    } catch (replenishError) {
        errorLog({
            message: 'Error replenishing queue after enabling autoplay:',
            error: replenishError,
        })
    }
}

/**
 * Handle autoplay errors
 */
async function handleAutoplayError(
    error: unknown,
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    errorLog({ message: 'Error in autoplay command:', error })
    await interactionReply({
        interaction,
        content: {
            embeds: [
                createEmbed({
                    title: 'Error',
                    description: messages.error.notPlaying,
                    color: EMBED_COLORS.ERROR as ColorResolvable,
                    emoji: EMOJIS.ERROR,
                }),
            ],
            ephemeral: true,
        },
    })
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('autoplay')
        .setDescription(
            '🔄 Enable or disable automatic playback of related music.',
        ),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return

        const guildId = interaction.guildId
        if (!guildId) return

        const queue = resolveGuildQueue(client, guildId)
        if (!(await requireQueue(queue, interaction))) return

        try {
            const isAutoplayEnabled =
                queue?.repeatMode === QueueRepeatMode.AUTOPLAY

            if (isAutoplayEnabled) {
                await handleDisableAutoplay(queue, interaction)
            } else {
                await handleEnableAutoplay(queue, interaction)
            }
        } catch (error) {
            await handleAutoplayError(error, interaction)
        }
    },
})
