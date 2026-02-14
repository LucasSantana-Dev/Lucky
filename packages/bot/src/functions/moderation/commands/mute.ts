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
        .setName('mute')
        .setDescription('Timeout a user')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption((option) =>
            option
                .setName('user')
                .setDescription('The user to mute')
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName('duration')
                .setDescription('Duration of the mute')
                .setRequired(true)
                .addChoices(
                    { name: '60 seconds', value: '60' },
                    { name: '5 minutes', value: '300' },
                    { name: '10 minutes', value: '600' },
                    { name: '1 hour', value: '3600' },
                    { name: '1 day', value: '86400' },
                    { name: '1 week', value: '604800' },
                ),
        )
        .addStringOption((option) =>
            option
                .setName('reason')
                .setDescription('Reason for the mute')
                .setRequired(false),
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
        const durationSeconds = parseInt(
            interaction.options.getString('duration', true),
        )
        const reason =
            interaction.options.getString('reason') || 'No reason provided'
        const silent = interaction.options.getBoolean('silent') || false

        try {
            const member = await interaction.guild.members.fetch(user.id)

            if (!member) {
                await interactionReply({
                    interaction,
                    content: { content: '❌ User not found in this server.' },
                })
                return
            }

            await member.timeout(durationSeconds * 1000, reason)

            const moderationCase = await moderationService.createCase({
                guildId: interaction.guild.id,
                type: 'mute',
                userId: user.id,
                username: user.tag,
                moderatorId: interaction.user.id,
                moderatorName: interaction.user.tag,
                reason,
                duration: durationSeconds,
                channelId: interaction.channelId,
            })

            const formatDuration = (seconds: number): string => {
                if (seconds < 60) return `${seconds} seconds`
                if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`
                if (seconds < 86400)
                    return `${Math.floor(seconds / 3600)} hours`
                return `${Math.floor(seconds / 86400)} days`
            }

            const embed = new EmbedBuilder()
                .setColor(0xff6b6b)
                .setTitle(`🔇 User Muted - Case #${moderationCase.caseNumber}`)
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
                    {
                        name: 'Duration',
                        value: formatDuration(durationSeconds),
                        inline: true,
                    },
                    { name: 'Reason', value: reason },
                )
                .setTimestamp()

            await interactionReply({
                interaction,
                content: { embeds: [embed] },
            })

            if (!silent) {
                try {
                    const dmEmbed = new EmbedBuilder()
                        .setColor(0xff6b6b)
                        .setTitle(
                            `🔇 You have been muted in ${interaction.guild.name}`,
                        )
                        .addFields(
                            {
                                name: 'Duration',
                                value: formatDuration(durationSeconds),
                            },
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
            }

            infoLog({
                message: `User ${user.tag} muted for ${formatDuration(durationSeconds)} by ${interaction.user.tag} in ${interaction.guild.name}`,
            })
        } catch (error) {
            errorLog({
                message: 'Failed to mute user',
                error: error as Error,
            })

            await interactionReply({
                interaction,
                content: {
                    content:
                        '❌ Failed to mute user. Please check permissions and try again.',
                },
            })
        }
    },
})
