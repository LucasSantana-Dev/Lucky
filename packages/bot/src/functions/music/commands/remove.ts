import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { interactionReply } from "../../../utils/general/interactionReply"
import { errorEmbed, successEmbed } from "../../../utils/general/embeds"
import {
    requireGuild,
    requireQueue,
    requireCurrentTrack,
} from "../../../utils/command/commandValidations"
import type { CommandExecuteParams } from "../../../types/CommandData"
import type { GuildQueue } from 'discord-player'

/**
 * Validate remove position
 */
function validateRemovePosition(pos: number, queueSize: number): string | null {
    if (queueSize === 0) {
        return 'The queue is empty!'
    }

    if (pos < 0 || pos >= queueSize) {
        return 'Invalid position!'
    }

    return null
}

/**
 * Remove track from queue
 */
function removeTrackFromQueue(queue: GuildQueue, pos: number): unknown {
    const tracks = queue.tracks.toArray()
    const removed = tracks[pos]
    queue.tracks.remove((_, i) => i === pos)
    return removed
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('remove')
        .setDescription('❌ Remove a song from the queue by number.')
        .addIntegerOption((option) =>
            option
                .setName('position')
                .setDescription('Position of the song in the queue (1 = next)')
                .setRequired(true),
        ),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return
        const queue = client.player.nodes.get(interaction.guildId ?? '')
        if (!(await requireQueue(queue, interaction))) return
        if (!(await requireCurrentTrack(queue, interaction))) return

        const pos = interaction.options.getInteger('position', true) - 1
        const queueSize = queue?.tracks.size ?? 0

        const validationError = validateRemovePosition(pos, queueSize)
        if (validationError) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [errorEmbed('Error', validationError)],
                },
            })
            return
        }

        if (!queue) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [errorEmbed('Error', 'No queue found!')],
                },
            })
            return
        }
        const removed = removeTrackFromQueue(queue, pos)
        if (!removed) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [errorEmbed('Error', 'Song not found!')],
                },
            })
            return
        }

        await interactionReply({
            interaction,
            content: {
                embeds: [
                    successEmbed(
                        'Song removed',
                        `Removed: **${(removed as { title: string; author: string }).title}** by ${(removed as { title: string; author: string }).author}`,
                    ),
                ],
            },
        })
    },
})
