import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import {
    createEmbed,
    createErrorEmbed,
    EMBED_COLORS,
    EMOJIS,
} from '../../../utils/general/embeds'
import { errorLog, debugLog, warnLog } from '@lucky/shared/utils'
import { guildSettingsService } from '@lucky/shared/services'
import { QueueRepeatMode, type GuildQueue } from 'discord-player'
import { requireGuild, requireDJRole } from '../../../utils/command/commandValidations'
import type { CommandExecuteParams } from '../../../types/CommandData'
import { messages } from '../../../utils/general/messages'
import type { ColorResolvable, ChatInputCommandInteraction } from 'discord.js'
import { replenishQueue } from '../../../utils/music/trackManagement/queueOperations'
import { resolveGuildQueue } from '../../../utils/music/queueResolver'

async function replyAutoplayPersistenceFailure(
    interaction: ChatInputCommandInteraction,
    queue: GuildQueue | null,
    enabled: boolean,
): Promise<void> {
    await interactionReply({
        interaction,
        content: {
            embeds: [
                createEmbed({
                    title: enabled
                        ? queue
                            ? 'Autoplay enabled for current queue only'
                            : 'Autoplay preference not saved'
                        : queue
                          ? 'Autoplay disabled for current queue only'
                          : 'Autoplay preference not saved',
                    description: enabled
                        ? queue
                            ? 'Autoplay was enabled on the active queue, but the preference could not be saved for future sessions.'
                            : 'Could not save autoplay preference. Please try again.'
                        : queue
                          ? 'Autoplay was disabled on the active queue, but the preference could not be saved for future sessions.'
                          : 'Could not update autoplay preference. Please try again.',
                    color: EMBED_COLORS.ERROR as ColorResolvable,
                    emoji: EMOJIS.ERROR,
                    timestamp: true,
                }),
            ],
            ephemeral: true,
        },
    })
}

async function handleDisableAutoplay(
    queue: GuildQueue | null,
    interaction: ChatInputCommandInteraction,
    guildId: string,
): Promise<void> {
    queue?.setRepeatMode(QueueRepeatMode.OFF)
    const persisted = await guildSettingsService.setGuildSettings(guildId, {
        autoPlayEnabled: false,
    })

    if (!persisted) {
        warnLog({
            message: 'Failed to persist autoplay disabled preference',
            data: { guildId, hasQueue: Boolean(queue) },
        })
        await replyAutoplayPersistenceFailure(interaction, queue, false)
        return
    }

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
    const persisted = await guildSettingsService.setGuildSettings(guildId, {
        autoPlayEnabled: true,
    })

    if (!persisted) {
        warnLog({
            message: 'Failed to persist autoplay enabled preference',
            data: { guildId, hasQueue: Boolean(queue) },
        })
        if (queue?.currentTrack) {
            void populateQueueWithRelatedTracks(queue, interaction)
        }
        await replyAutoplayPersistenceFailure(interaction, queue, true)
        return
    }

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
            embeds: [createErrorEmbed('Error', messages.error.notPlaying)],
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
    return settings?.autoPlayEnabled ?? true
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
        if (!(await requireDJRole(interaction, interaction.guildId!))) return

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
            await interaction.deferReply()
        } catch (error) {
            const isUnknownInteraction =
                typeof error === 'object' &&
                error !== null &&
                'code' in error &&
                (error as { code?: number }).code === 10062
            if (isUnknownInteraction) return
            throw error
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
