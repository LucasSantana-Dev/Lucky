import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import {
    createInfoEmbed,
    createSuccessEmbed,
    createWarningEmbed,
} from '../../../utils/general/embeds'
import type { CommandExecuteParams } from '../../../types/CommandData'
import { requireGuild } from '../../../utils/command/commandValidations'
import { collaborativePlaylistService } from '../../../utils/music/collaborativePlaylist'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('playlist')
        .setDescription('📚 Playlist collaboration controls')
        .addSubcommand((subcommand) =>
            subcommand
                .setName('collaborative')
                .setDescription('Manage collaborative queue mode')
                .addStringOption((option) =>
                    option
                        .setName('action')
                        .setDescription('Action to perform')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Enable', value: 'enable' },
                            { name: 'Disable', value: 'disable' },
                            { name: 'Status', value: 'status' },
                            { name: 'Reset contributions', value: 'reset' },
                        ),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('per_user_limit')
                        .setDescription(
                            'Max tracks per user while collaborative mode is enabled',
                        )
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(25),
                ),
        ),
    category: 'music',
    execute: async ({ interaction }: CommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return

        const guildId = interaction.guildId
        if (!guildId) return

        const action = interaction.options.getString('action', true)
        const limit = interaction.options.getInteger('per_user_limit')

        if (action === 'status') {
            const state = collaborativePlaylistService.getState(guildId)
            const contributions = Object.entries(state.contributions)
                .map(([userId, count]) => `• <@${userId}>: ${count}`)
                .join('\n')

            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createInfoEmbed(
                            'Collaborative playlist status',
                            `Enabled: ${state.enabled ? 'yes' : 'no'}\nPer-user limit: ${state.perUserLimit}\nContributions:\n${contributions || 'No contributions yet.'}`,
                        ),
                    ],
                    ephemeral: true,
                },
            })
            return
        }

        if (action === 'reset') {
            collaborativePlaylistService.resetContributions(guildId)
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createWarningEmbed(
                            'Contributions reset',
                            'Collaborative playlist contribution counters were reset.',
                        ),
                    ],
                },
            })
            return
        }

        if (action === 'enable') {
            const state = collaborativePlaylistService.setMode(
                guildId,
                true,
                limit ?? undefined,
            )
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createSuccessEmbed(
                            'Collaborative mode enabled',
                            `Per-user queue contribution limit set to ${state.perUserLimit}.`,
                        ),
                    ],
                },
            })
            return
        }

        collaborativePlaylistService.setMode(guildId, false)
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createWarningEmbed(
                        'Collaborative mode disabled',
                        'Per-user queue contribution limits are no longer enforced.',
                    ),
                ],
            },
        })
    },
})
