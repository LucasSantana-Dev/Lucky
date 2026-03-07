import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
} from 'discord.js'
import Command from '../../../models/Command.js'
import { moderationService } from '@nexus/shared/services'
import { infoLog, errorLog } from '@nexus/shared/utils'
import { interactionReply } from '../../../utils/general/interactionReply.js'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a member from the server')
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .addUserOption((option) =>
            option
                .setName('user')
                .setDescription('The user to kick')
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName('reason')
                .setDescription('Reason for the kick')
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

            if (!silent) {
                try {
                    const dmEmbed = new EmbedBuilder()
                        .setColor(0xff8787)
                        .setTitle(
                            `👢 You have been kicked from ${interaction.guild.name}`,
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

            await member.kick(reason)

            const moderationCase = await moderationService.createCase({
                guildId: interaction.guild.id,
                type: 'kick',
                userId: user.id,
                username: user.tag,
                moderatorId: interaction.user.id,
                moderatorName: interaction.user.tag,
                reason,
                channelId: interaction.channelId,
            })

            const embed = new EmbedBuilder()
                .setColor(0xff8787)
                .setTitle(`👢 User Kicked - Case #${moderationCase.caseNumber}`)
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

            infoLog({
                message: `User ${user.tag} kicked by ${interaction.user.tag} from ${interaction.guild.name}`,
            })
        } catch (error) {
            errorLog({
                message: 'Failed to kick user',
                error: error as Error,
            })

            await interactionReply({
                interaction,
                content: {
                    content:
                        '❌ Failed to kick user. Please check permissions and try again.',
                },
            })
        }
    },
})
