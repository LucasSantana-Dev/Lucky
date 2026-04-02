import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import {
    createEmbed,
    EMBED_COLORS,
    EMOJIS,
} from '../../../utils/general/embeds'
import { errorLog, debugLog, warnLog } from '@lucky/shared/utils'
import { guildSettingsService } from '@lucky/shared/services'
import { QueueRepeatMode, type GuildQueue } from 'discord-player'
import { requireGuild } from '../../../utils/command/commandValidations'
import type { CommandExecuteParams } from '../../../types/CommandData'
import { messages } from '../../../utils/general/messages'
import type { ColorResolvable, ChatInputCommandInteraction } from 'discord.js'
import { replenishQueue } from '../../../utils/music/trackManagement/queueOperations'
import { resolveGuildQueue } from '../../../utils/music/queueResolver'

async function handleDisableAutoplay(
    queue: GuildQueue | null,
    interaction: ChatInputCommandInteraction,
    guildId: string,
): Promise<void> {
    queue?.setRepeatMode(QueueRepeatMode.OFF)
    await guildSettingsService.setGuildSettings(guildId, {
        autoPlayEnabled: false,
    })

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

async function handleEnableAutoplay(
    queue: GuildQueue | null,
    interaction: ChatInputCommandInteraction,
    guildId: string,
): Promise<void> {
    queue?.setRepeatMode(QueueRepeatMode.AUTOPLAY)
    await guildSettingsService.setGuildSettings(guildId, {
        autoPlayEnabled: true,
    })

    await interactionReply({
        interaction,
        content: {
            embeds: [
                createEmbed({
                    title: 'Autoplay enabled',
                    description: queue
                        ? 'Autoplay has been enabled. The bot will automatically add related songs when the queue is empty.'
                        : 'Autoplay preference saved. Next time you use /play, autoplay will be enabled automatically.',
                    color: EMBED_COLORS.AUTOPLAY as ColorResolvable,
                    emoji: EMOJIS.AUTOPLAY,
                    timestamp: true,
                }),
            ],
        },
    })

    if (queue?.currentTrack) {
        void populateQueueWithRelatedTracks(queue, interaction)
    }
}

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

async function resolveCurrentAutoplayState(
    queue: GuildQueue | null,
    guildId: string,
): Promise<boolean> {
    if (queue) {
        return queue.repeatMode === QueueRepeatMode.AUTOPLAY
    }
    const settings = await guildSettingsService.getGuildSettings(guildId)
    return settings?.autoPlayEnabled ?? false
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

        const { queue, source, diagnostics } = resolveGuildQueue(
            client,
            guildId,
        )
        if (!queue) {
            warnLog({
                message: 'Autoplay queue resolution miss',
                data: {
                    guildId,
                    userId: interaction.user.id,
                    source,
                    cacheSize: diagnostics.cacheSize,
                    cacheSampleKeys: diagnostics.cacheSampleKeys,
                },
            })
        }

        try {
            const isAutoplayEnabled = await resolveCurrentAutoplayState(
                queue,
                guildId,
            )

            if (isAutoplayEnabled) {
                await handleDisableAutoplay(queue, interaction, guildId)
            } else {
                await handleEnableAutoplay(queue, interaction, guildId)
            }
        } catch (error) {
            await handleAutoplayError(error, interaction)
        }
    },
})
