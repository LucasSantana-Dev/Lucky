import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import { createErrorEmbed, createSuccessEmbed } from '../../../utils/general/embeds'
import type { CommandExecuteParams } from '../../../types/CommandData'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { GuildQueue } from 'discord-player'
import {
    requireGuild,
    requireQueue,
    requireIsPlaying,
} from '../../../utils/command/commandValidations'
import { resolveGuildQueue } from '../../../utils/music/queueResolver'

const BASS_BOOST_LEVELS: Record<number, string[]> = {
    0: [],
    1: ['bassboost'],
    2: ['bassboost'],
    3: ['bassboost_low'],
    4: ['bassboost'],
    5: ['bassboost_high'],
}

async function handleBassBoost(
    queue: GuildQueue,
    level: number,
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    if (level < 0 || level > 5) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed('Error', '🔊 Bass boost level must be between 0 and 5!'),
                ],
            },
        })
        return
    }

    try {
        const filters = BASS_BOOST_LEVELS[level] ?? []
        if (filters.length > 0) {
            await queue.filters.ffmpeg.toggle(filters)
        } else {
            await queue.filters.ffmpeg.toggle(['bassboost_high'])
            await queue.filters.ffmpeg.toggle(['bassboost_high'])
        }

        const message = level === 0 ? 'Bass boost disabled' : `Bass boost level set to ${level}`
        await interactionReply({
            interaction,
            content: {
                embeds: [createSuccessEmbed('Bass boost', `🔊 ${message}`)],
            },
        })
    } catch (error) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed('Error', 'Failed to apply bass boost effect.'),
                ],
            },
        })
    }
}

async function handleNightcore(
    queue: GuildQueue,
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    try {
        const enabled = queue.filters.resampler.toggleFilter('nightcore')

        const message = enabled ? 'Nightcore enabled' : 'Nightcore disabled'
        await interactionReply({
            interaction,
            content: {
                embeds: [createSuccessEmbed('Nightcore', `🎵 ${message}`)],
            },
        })
    } catch (error) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed('Error', 'Failed to toggle nightcore effect.'),
                ],
            },
        })
    }
}

async function handleReset(
    queue: GuildQueue,
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    try {
        await queue.filters.ffmpeg.setFilters([])
        queue.filters.resampler.toggleFilter('nightcore')

        await interactionReply({
            interaction,
            content: {
                embeds: [createSuccessEmbed('Effects reset', '✨ All effects have been cleared.')],
            },
        })
    } catch (error) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed('Error', 'Failed to reset effects.'),
                ],
            },
        })
    }
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('effects')
        .setDescription('🎵 Apply audio effects to the current track')
        .addSubcommand((sub) =>
            sub
                .setName('bassboost')
                .setDescription('Set bass boost level (0-5)')
                .addIntegerOption((opt) =>
                    opt
                        .setName('level')
                        .setDescription('Bass boost level')
                        .setRequired(true)
                        .setMinValue(0)
                        .setMaxValue(5),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('nightcore')
                .setDescription('Toggle nightcore audio effect'),
        )
        .addSubcommand((sub) =>
            sub
                .setName('reset')
                .setDescription('Clear all audio effects'),
        ),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return

        const { queue } = resolveGuildQueue(client, interaction.guildId ?? '')
        if (!(await requireQueue(queue, interaction))) return
        if (!(await requireIsPlaying(queue, interaction))) return

        const subcommand = interaction.options.getSubcommand()

        if (subcommand === 'bassboost') {
            const level = interaction.options.getInteger('level', true)
            await handleBassBoost(queue, level, interaction)
        } else if (subcommand === 'nightcore') {
            await handleNightcore(queue, interaction)
        } else if (subcommand === 'reset') {
            await handleReset(queue, interaction)
        }
    },
})
