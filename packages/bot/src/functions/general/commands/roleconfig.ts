import { SlashCommandBuilder } from '@discordjs/builders'
import { PermissionFlagsBits } from 'discord.js'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import { requireGuild } from '../../../utils/command/commandValidations'
import { errorEmbed } from '../../../utils/general/embeds'
import { errorLog } from '@lukbot/shared/utils'
import { handleSetExclusive, handleRemoveExclusive, handleListExclusive } from './roleconfigHandlers'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('roleconfig')
        .setDescription('Configure mutually exclusive roles')
        .addSubcommand((sub) =>
            sub.setName('set-exclusive')
                .setDescription('Set role A to automatically remove role B when added')
                .addRoleOption((opt) => opt.setName('role').setDescription('Role that triggers the exclusion').setRequired(true))
                .addRoleOption((opt) => opt.setName('excluded_role').setDescription('Role to be removed when role is added').setRequired(true)),
        )
        .addSubcommand((sub) =>
            sub.setName('remove-exclusive')
                .setDescription('Remove an exclusive role rule')
                .addRoleOption((opt) => opt.setName('role').setDescription('Role that triggers the exclusion').setRequired(true))
                .addRoleOption((opt) => opt.setName('excluded_role').setDescription('Role to be removed').setRequired(true)),
        )
        .addSubcommand((sub) =>
            sub.setName('list').setDescription('List all exclusive role rules in this server'),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    category: 'general',
    execute: async ({ interaction }) => {
        if (!(await requireGuild(interaction))) return
        if (!interaction.guild) return

        const subcommand = interaction.options.getSubcommand()

        try {
            if (subcommand === 'set-exclusive') return await handleSetExclusive(interaction)
            if (subcommand === 'remove-exclusive') return await handleRemoveExclusive(interaction)
            if (subcommand === 'list') return await handleListExclusive(interaction)
        } catch (error) {
            errorLog({ message: 'Error in roleconfig command:', error })
            await interactionReply({
                interaction,
                content: { embeds: [errorEmbed('Error', 'An error occurred while processing your request.')], ephemeral: true },
            })
        }
    },
})
