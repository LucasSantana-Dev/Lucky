import { SlashCommandBuilder } from '@discordjs/builders'
import { PermissionFlagsBits } from 'discord.js'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import { requireGuild } from '../../../utils/command/commandValidations'
import { errorEmbed } from '../../../utils/general/embeds'
import { errorLog } from '@lukbot/shared/utils'
import { handleCreate, handleDelete, handleList } from './reactionroleHandlers'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('reactionrole')
        .setDescription('Manage reaction roles with embed builders and buttons')
        .addSubcommand((sub) =>
            sub.setName('create').setDescription('Create a reaction role message')
                .addChannelOption((o) => o.setName('channel').setDescription('Channel to send the message in').setRequired(true))
                .addStringOption((o) => o.setName('title').setDescription('Embed title').setRequired(true))
                .addStringOption((o) => o.setName('description').setDescription('Embed description').setRequired(true))
                .addStringOption((o) => o.setName('roles')
                    .setDescription('Roles in format: roleId:label:emoji:style (comma-separated). Style: Primary, Secondary, Success, Danger')
                    .setRequired(true)),
        )
        .addSubcommand((sub) =>
            sub.setName('delete').setDescription('Delete a reaction role message')
                .addStringOption((o) => o.setName('message_id').setDescription('Message ID of the reaction role message').setRequired(true)),
        )
        .addSubcommand((sub) =>
            sub.setName('list').setDescription('List all reaction role messages in this server'),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    category: 'general',
    execute: async ({ interaction }) => {
        if (!(await requireGuild(interaction))) return
        if (!interaction.guild) return

        const subcommand = interaction.options.getSubcommand()

        try {
            if (subcommand === 'create') await handleCreate(interaction, interaction.guild)
            else if (subcommand === 'delete') await handleDelete(interaction, interaction.guild)
            else if (subcommand === 'list') await handleList(interaction, interaction.guild)
        } catch (error) {
            errorLog({ message: 'Error in reactionrole command:', error })
            await interactionReply({
                interaction,
                content: {
                    embeds: [errorEmbed('Error', error instanceof Error ? error.message : 'An error occurred while processing your request.')],
                    ephemeral: true,
                },
            })
        }
    },
})
