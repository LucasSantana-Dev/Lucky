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
        .setName('ban')
        .setDescription('Ban a user from the server')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addUserOption((option) =>
            option
                .setName('user')
                .setDescription('The user to ban')
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName('reason')
                .setDescription('Reason for the ban')
                .setRequired(false),
        )
        .addStringOption((option) =>
            option
                .setName('delete_messages')
                .setDescription('Delete messages from the last...')
                .setRequired(false)
                .addChoices(
                    { name: "Don't delete", value: '0' },
                    { name: '1 hour', value: '3600' },
                    { name: '6 hours', value: '21600' },
                    { name: '12 hours', value: '43200' },
                    { name: '24 hours', value: '86400' },
                    { name: '7 days', value: '604800' },
                ),
        )
        .addBooleanOption((option) =>
            option
                .setName('silent')
                .setDescription('Do not send a DM to the user')
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
        const deleteSeconds = parseInt(
            interaction.options.getString('delete_messages') || '0',
        )
        const silent = interaction.options.getBoolean('silent') || false

        try {
            if (!silent) {
                try {
                    const dmEmbed = new EmbedBuilder()
                        .setColor(0xc92a2a)
                        .setTitle(
                            `🔨 You have been banned from ${interaction.guild.name}`,
                        )
                        .addFields({ name: 'Reason', value: reason })
                        .setTimestamp()

                    await user.send({ embeds: [dmEmbed] })
                } catch (error) {
                    errorLog({
                        message: `Failed to send DM to ${user.tag}`,
                        error: error as Error,
                    })
                }
            }

            await interaction.guild.members.ban(user.id, {
                reason,
                deleteMessageSeconds: deleteSeconds,
            })

            const moderationCase = await moderationService.createCase({
                guildId: interaction.guild.id,
                type: 'ban',
                userId: user.id,
                username: user.tag,
                moderatorId: interaction.user.id,
                moderatorName: interaction.user.tag,
                reason,
                channelId: interaction.channelId,
            })

            const embed = new EmbedBuilder()
                .setColor(0xc92a2a)
                .setTitle(`🔨 User Banned - Case #${moderationCase.caseNumber}`)
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

            if (deleteSeconds > 0) {
                const formatTime = (seconds: number): string => {
                    if (seconds < 3600) return `${seconds / 3600} hour`
                    if (seconds < 86400) return `${seconds / 3600} hours`
                    return `${seconds / 86400} days`
                }
                embed.addFields({
                    name: 'Messages Deleted',
                    value: `Last ${formatTime(deleteSeconds)}`,
                })
            }

            await interactionReply({
                interaction,
                content: { embeds: [embed] },
            })

            infoLog({
                message: `User ${user.tag} banned by ${interaction.user.tag} from ${interaction.guild.name}`,
            })
        } catch (error) {
            errorLog({
                message: 'Failed to ban user',
                error: error as Error,
            })

            await interactionReply({
                interaction,
                content: {
                    content:
                        '❌ Failed to ban user. Please check permissions and try again.',
                },
            })
        }
    },
})
