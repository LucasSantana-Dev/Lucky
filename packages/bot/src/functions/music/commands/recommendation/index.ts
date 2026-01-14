import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../../models/Command'
import { requireGuild } from "../../../../utils/command/commandValidations"
import type { CommandExecuteParams } from "../../../../types/CommandData"
import {
    handleShowSettings,
    handleUpdateSettings,
    handleApplyPreset,
    handleResetSettings
} from './handlers'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('recommendation')
        .setDescription('🎵 Manage music recommendation settings')
        .addSubcommand(subcommand =>
            subcommand
                .setName('show')
                .setDescription('Show current recommendation settings')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('update')
                .setDescription('Update recommendation settings')
                .addBooleanOption(option =>
                    option
                        .setName('enabled')
                        .setDescription('Enable/disable recommendations')
                        .setRequired(false)
                )
                .addIntegerOption(option =>
                    option
                        .setName('max_recommendations')
                        .setDescription('Maximum number of recommendations')
                        .setMinValue(1)
                        .setMaxValue(20)
                        .setRequired(false)
                )
                .addNumberOption(option =>
                    option
                        .setName('similarity_threshold')
                        .setDescription('Similarity threshold (0.0-1.0)')
                        .setMinValue(0.0)
                        .setMaxValue(1.0)
                        .setRequired(false)
                )
                .addNumberOption(option =>
                    option
                        .setName('genre_weight')
                        .setDescription('Genre weight (0.0-1.0)')
                        .setMinValue(0.0)
                        .setMaxValue(1.0)
                        .setRequired(false)
                )
                .addNumberOption(option =>
                    option
                        .setName('tag_weight')
                        .setDescription('Tag weight (0.0-1.0)')
                        .setMinValue(0.0)
                        .setMaxValue(1.0)
                        .setRequired(false)
                )
                .addNumberOption(option =>
                    option
                        .setName('artist_weight')
                        .setDescription('Artist weight (0.0-1.0)')
                        .setMinValue(0.0)
                        .setMaxValue(1.0)
                        .setRequired(false)
                )
                .addBooleanOption(option =>
                    option
                        .setName('learning_enabled')
                        .setDescription('Enable learning from user preferences')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('preset')
                .setDescription('Apply a recommendation preset')
                .addStringOption(option =>
                    option
                        .setName('preset')
                        .setDescription('Preset to apply')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Balanced', value: 'balanced' },
                            { name: 'Conservative', value: 'conservative' },
                            { name: 'Experimental', value: 'experimental' },
                            { name: 'Disabled', value: 'disabled' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription('Reset settings to defaults')
                .addBooleanOption(option =>
                    option
                        .setName('confirm')
                        .setDescription('Confirm the reset')
                        .setRequired(true)
                )
        ),
    category: 'music',
    execute: async ({ client: _client, interaction }: CommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return

        const subcommand = interaction.options.getSubcommand()

        switch (subcommand) {
            case 'show':
                await handleShowSettings(interaction)
                break
            case 'update':
                await handleUpdateSettings(interaction)
                break
            case 'preset':
                await handleApplyPreset(interaction)
                break
            case 'reset':
                await handleResetSettings(interaction)
                break
            default:
                await interaction.reply({
                    content: 'Unknown subcommand.',
                    ephemeral: true,
                })
        }
    },
})
