import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
} from 'discord.js'
import Command from '../../../models/Command.js'
import { moderationService } from '@lucky/shared/services'
import { infoLog, errorLog } from '@lucky/shared/utils'
import { interactionReply } from '../../../utils/general/interactionReply.js'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Unban a user from the server')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addStringOption((option) =>
            option
                .setName('user_id')
                .setDescription('The ID of the user to unban')
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName('reason')
                .setDescription('Reason for the unban')
                .setRequired(false),
        ),
    category: 'moderation',
    execute: async ({ interaction }) => {
        if (!interaction.guild) {
            await interactionReply({
                interaction,
                content: {
                    content: '❌ This command can only be used in a server.',
                },
            })
            return
        }

        const userId = interaction.options.getString('user_id', true)
        const reason =
            interaction.options.getString('reason') || 'No reason provided'

        try {
            await interaction.guild.members.unban(userId, reason)

            let username = userId
            try {
                const user = await interaction.client.users.fetch(userId)
                username = user.tag
            } catch {
                // User not found, use ID as username
            }

            const moderationCase = await moderationService.createCase({
                guildId: interaction.guild.id,
                type: 'unban',
                userId,
                username,
                moderatorId: interaction.user.id,
                moderatorName: interaction.user.tag,
                reason,
                channelId: interaction.channelId,
            })

            const embed = new EmbedBuilder()
                .setColor(0x51cf66)
                .setTitle(
                    `✅ User Unbanned - Case #${moderationCase.caseNumber}`,
                )
                .addFields(
                    {
                        name: 'User',
                        value: `${username} (${userId})`,
                        inline: true,
                    },
                    {
                        name: 'Moderator',
                        value: interaction.user.tag,
                        inline: true,
                    },
                    { name: 'Reason', value: reason },
                )
                .setTimestamp()

            await interactionReply({
                interaction,
                content: { embeds: [embed] },
            })

            infoLog({
                message: `User ${username} unbanned by ${interaction.user.tag} in ${interaction.guild.name}`,
            })
        } catch (error) {
            errorLog({
                message: 'Failed to unban user',
                error: error as Error,
            })

            await interactionReply({
                interaction,
                content: {
                    content:
                        '❌ Failed to unban user. User may not be banned or ID is invalid.',
                },
            })
        }
    },
})
