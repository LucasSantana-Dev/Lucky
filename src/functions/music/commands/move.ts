import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import { errorEmbed, successEmbed } from '../../../utils/general/embeds'
import {
    requireGuild,
    requireQueue,
    requireCurrentTrack,
} from '../../../utils/command/commandValidations'
import type { CommandExecuteParams } from '../../../types/CommandData'
import type { GuildQueue } from 'discord-player'
import type { ChatInputCommandInteraction } from 'discord.js'

/**
 * Handle empty queue case
 */
async function handleEmptyQueue(
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    await interactionReply({
        interaction,
        content: {
            embeds: [
                errorEmbed('Empty queue', '🗑️ The queue is already empty!'),
            ],
        },
    })
}

/**
 * Validate move positions
 */
function validateMovePositions(
    from: number,
    to: number,
    queueSize: number,
): string | null {
    if (queueSize === 0) {
        return 'The queue is empty!'
    }

    if (from < 0 || from >= queueSize || to < 0 || to >= queueSize) {
        return 'Invalid position!'
    }

    return null
}

/**
 * Move track in queue
 */
function moveTrackInQueue(
    queue: GuildQueue,
    from: number,
    to: number,
): unknown {
    const tracks = queue.tracks.toArray()
    const [moved] = tracks.splice(from, 1)
    tracks.splice(to, 0, moved)
    queue.tracks.clear()
    queue.tracks.add(tracks)
    return moved
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('move')
        .setDescription('🔀 Move a song to another position in the queue.')
        .addIntegerOption((option) =>
            option
                .setName('from')
                .setDescription('Current position (1 = next)')
                .setRequired(true),
        )
        .addIntegerOption((option) =>
            option
                .setName('to')
                .setDescription('New position (1 = next)')
                .setRequired(true),
        ),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return
        const queue = client.player.nodes.get(interaction.guildId ?? '')
        if (!(await requireQueue(queue, interaction))) return
        if (!(await requireCurrentTrack(queue, interaction))) return

        const from = interaction.options.getInteger('from', true) - 1
        const to = interaction.options.getInteger('to', true) - 1
        const queueSize = queue?.tracks.size ?? 0

        const validationError = validateMovePositions(from, to, queueSize)
        if (validationError !== null) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [errorEmbed('Error', validationError)],
                },
            })
            return
        }

        if (!queue) {
            await handleEmptyQueue(interaction)
            return
        }

        const moved = moveTrackInQueue(queue, from, to)

        await interactionReply({
            interaction,
            content: {
                embeds: [
                    successEmbed(
                        'Song moved',
                        `Moved: **${(moved as { title: string }).title}** to position ${to + 1}`,
                    ),
                ],
            },
        })
    },
})
