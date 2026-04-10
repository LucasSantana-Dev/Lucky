import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import { createErrorEmbed, createSuccessEmbed } from '../../../utils/general/embeds'
import { guildSettingsService } from '@lucky/shared/services'
import { requireGuild } from '../../../utils/command/commandValidations'
import type { CommandExecuteParams } from '../../../types/CommandData'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('settings')
        .setDescription('⚙️ Configure bot settings for this server.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommandGroup((group) =>
            group
                .setName('music')
                .setDescription('Music settings')
                .addSubcommand((sub) =>
                    sub
                        .setName('idle-timeout')
                        .setDescription('Set idle disconnect timeout (0 = disabled)')
                        .addIntegerOption((opt) =>
                            opt
                                .setName('minutes')
                                .setDescription('Minutes before disconnecting (0-60, 0 = disabled)')
                                .setMinValue(0)
                                .setMaxValue(60)
                                .setRequired(true),
                        ),
                ),
        ),
    category: 'management',
    execute: async ({ interaction }: CommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return
        const guildId = interaction.guildId!

        await interaction.deferReply({ ephemeral: true })

        const group = interaction.options.getSubcommandGroup()
        const sub = interaction.options.getSubcommand()

        if (group === 'music' && sub === 'idle-timeout') {
            const minutes = interaction.options.getInteger('minutes', true)
            const persisted = await guildSettingsService.setGuildSettings(guildId, {
                idleTimeoutMinutes: minutes,
            })

            if (!persisted) {
                await interactionReply({
                    interaction,
                    content: { embeds: [createErrorEmbed('Error', 'Failed to save setting.')] },
                })
                return
            }

            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createSuccessEmbed(
                            'Setting Updated',
                            minutes === 0
                                ? 'Idle disconnect disabled.'
                                : `Bot will leave voice after **${minutes} minute${minutes === 1 ? '' : 's'}** of inactivity.`,
                        ),
                    ],
                },
            })
        }
    },
})
