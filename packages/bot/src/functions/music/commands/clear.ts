import { SlashCommandBuilder } from '@discordjs/builders'
import {
    createErrorEmbed,
    createSuccessEmbed,
} from '../../../utils/general/embeds'
import { interactionReply } from '../../../utils/general/interactionReply'
import { debugLog, errorLog } from '@lucky/shared/utils'
import Command from '../../../models/Command'
import {
    requireGuild,
    requireQueue,
} from '../../../utils/command/commandValidations'
import type { CommandExecuteParams } from '../../../types/CommandData'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { GuildQueue } from 'discord-player'
import { resolveGuildQueue } from '../../../utils/music/queueResolver'
import { setReplenishSuppressed } from '../../../utils/music/replenishSuppressionStore'

// Same window queueExhaustion.ts uses when the queue runs dry with nothing
// left to recover — keeps /clear from being silently undone by autoplay
// refilling the queue the moment the current track ends.
const CLEAR_REPLENISH_SUPPRESSION_MS = 35_000

async function handleEmptyQueue(
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    await interactionReply({
        interaction,
        content: {
            embeds: [
                createErrorEmbed(
                    'Empty queue',
                    '🗑️ The queue is already empty!',
                ),
            ],
            ephemeral: true,
        },
    })
}

async function clearQueueAndRespond(
    queue: GuildQueue,
    trackCount: number,
    interaction: ChatInputCommandInteraction,
    guildId: string,
): Promise<void> {
    queue.clear()
    setReplenishSuppressed(guildId, CLEAR_REPLENISH_SUPPRESSION_MS)

    debugLog({
        message: `Cleared ${trackCount} tracks from queue in guild ${guildId}`,
    })

    await interactionReply({
        interaction,
        content: {
            embeds: [
                createSuccessEmbed(
                    'Queue cleared',
                    `🗑️ Removed ${trackCount} songs from the queue!`,
                ),
            ],
        },
    })
}

async function handleClearError(
    error: unknown,
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    errorLog({ message: 'Error in clear command:', error })
    await interactionReply({
        interaction,
        content: {
            embeds: [
                createErrorEmbed(
                    'Error',
                    '🔄 An error occurred while clearing the queue!',
                ),
            ],
            ephemeral: true,
        },
    })
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('🗑️ Clear the music queue'),
    category: 'music',
    execute: async ({
        client,
        interaction,
    }: CommandExecuteParams): Promise<void> => {
        if (!(await requireGuild(interaction))) return

        const { queue } = resolveGuildQueue(client, interaction.guildId ?? '')
        if (!(await requireQueue(queue, interaction))) return

        try {
            if (queue?.tracks.size === 0) {
                await handleEmptyQueue(interaction)
                return
            }

            const trackCount = queue?.tracks.size ?? 0
            if (!queue) {
                await handleEmptyQueue(interaction)
                return
            }
            await clearQueueAndRespond(
                queue,
                trackCount,
                interaction,
                interaction.guildId ?? '',
            )
        } catch (error) {
            await handleClearError(error, interaction)
        }
    },
})
