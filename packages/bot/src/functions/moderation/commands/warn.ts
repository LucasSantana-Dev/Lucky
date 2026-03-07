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
        .setName('warn')
        .setDescription('Issue a warning to a user')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption((option) =>
            option
                .setName('user')
                .setDescription('The user to warn')
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName('reason')
                .setDescription('Reason for the warning')
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
            const moderationCase = await moderationService.createCase({
                guildId: interaction.guild.id,
                type: 'warn',
                userId: user.id,
                username: user.tag,
                moderatorId: interaction.user.id,
                moderatorName: interaction.user.tag,
                reason,
                channelId: interaction.channelId,
            })

            const embed = new EmbedBuilder()
                .setColor(0xffa500)
                .setTitle(
                    `⚠️ Warning Issued - Case #${moderationCase.caseNumber}`,
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

            if (!silent) {
                try {
                    const dmEmbed = new EmbedBuilder()
                        .setColor(0xffa500)
                        .setTitle(
                            `⚠️ You have been warned in ${interaction.guild.name}`,
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
            }

            infoLog({
                message: `Warning issued to ${user.tag} by ${interaction.user.tag} in ${interaction.guild.name}`,
            })
        } catch (error) {
            errorLog({
                message: 'Failed to issue warning',
                error: error as Error,
            })

            await interactionReply({
                interaction,
                content: {
                    content: '❌ Failed to issue warning. Please try again.',
                },
            })
        }
    },
})
