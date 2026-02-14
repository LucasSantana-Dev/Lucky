import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
} from 'discord.js'
import Command from '../../../models/Command.js'
import { moderationService } from '@lukbot/shared/services'
import { infoLog, errorLog } from '@lukbot/shared/utils'
import { interactionReply } from '../../../utils/general/interactionReply.js'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Remove timeout from a user')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption((option) =>
            option
                .setName('user')
                .setDescription('The user to unmute')
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName('reason')
                .setDescription('Reason for removing the mute')
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

        const user = interaction.options.getUser('user', true)
        const reason =
            interaction.options.getString('reason') || 'No reason provided'

        try {
            const member = await interaction.guild.members.fetch(user.id)

            if (!member) {
                await interactionReply({
                    interaction,
                    content: { content: '❌ User not found in this server.' },
                })
                return
            }

            await member.timeout(null, reason)

            const moderationCase = await moderationService.createCase({
                guildId: interaction.guild.id,
                type: 'unmute',
                userId: user.id,
                username: user.tag,
                moderatorId: interaction.user.id,
                moderatorName: interaction.user.tag,
                reason,
                channelId: interaction.channelId,
            })

            const embed = new EmbedBuilder()
                .setColor(0x51cf66)
                .setTitle(
                    `🔊 User Unmuted - Case #${moderationCase.caseNumber}`,
                )
                .addFields(
                    {
                        name: 'User',
                        value: `${user.tag} (${user.id})`,
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

            try {
                const dmEmbed = new EmbedBuilder()
                    .setColor(0x51cf66)
                    .setTitle(
                        `🔊 You have been unmuted in ${interaction.guild.name}`,
                    )
                    .addFields(
                        { name: 'Reason', value: reason },
                        {
                            name: 'Case Number',
                            value: `#${moderationCase.caseNumber}`,
                            inline: true,
                        },
                    )
                    .setTimestamp()

                await user.send({ embeds: [dmEmbed] })
            } catch (error) {
                errorLog({
                    message: `Failed to send DM to ${user.tag}`,
                    error: error as Error,
                })
            }

            infoLog({
                message: `User ${user.tag} unmuted by ${interaction.user.tag} in ${interaction.guild.name}`,
            })
        } catch (error) {
            errorLog({
                message: 'Failed to unmute user',
                error: error as Error,
            })

            await interactionReply({
                interaction,
                content: {
                    content:
                        '❌ Failed to unmute user. Please check permissions and try again.',
                },
            })
        }
    },
})
