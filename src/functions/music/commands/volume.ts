import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import { errorEmbed, successEmbed } from '../../../utils/general/embeds'
import type { CommandExecuteParams } from '../../../types/CommandData'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { GuildQueue } from 'discord-player'
import {
    requireGuild,
    requireQueue,
    requireCurrentTrack,
    requireIsPlaying,
} from '../../../utils/command/commandValidations'

/**
 * Validate volume value
 */
function validateVolume(value: number | null): string | null {
    if (value === null) {
        return null // Valid - show current volume
    }

    if (value < 1 || value > 100) {
        return '🔊 Volume must be between 1 and 100!'
    }

    return null
}

/**
 * Show current volume
 */
async function showCurrentVolume(
    queue: { node: { volume: number } },
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    await interactionReply({
        interaction,
        content: {
            embeds: [
                successEmbed(
                    'Current volume',
                    `🔊 Volume is at ${queue?.node?.volume ?? 100}%`,
                ),
            ],
        },
    })
}

/**
 * Set volume and show confirmation
 */
async function setVolume(
    queue: GuildQueue,
    value: number,
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    queue.node.setVolume(value)
    await interactionReply({
        interaction,
        content: {
            embeds: [
                successEmbed('Volume changed', `🔊 Volume set to ${value}%`),
            ],
        },
    })
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('🔊 Set or show the playback volume.')
        .addIntegerOption((option) =>
            option.setName('value').setDescription('Volume (1-100)'),
        ),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return

        const queue = client.player.nodes.get(interaction.guildId ?? '')
        if (!(await requireQueue(queue, interaction))) return

        if (!(await requireCurrentTrack(queue, interaction))) return
        if (!(await requireIsPlaying(queue, interaction))) return

        const value = interaction.options.getInteger('value')
        const validationError = validateVolume(value)

        if (validationError) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [errorEmbed('Error', validationError)],
                },
            })
            return
        }

        if (value === null) {
            await showCurrentVolume(queue as { node: { volume: number } }, interaction)
        } else {
            if (queue) {
                await setVolume(queue, value, interaction)
            }
        }
    },
})
