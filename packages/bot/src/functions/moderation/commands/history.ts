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
        .setName('history')
        .setDescription('View moderation history for a user')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption((option) =>
            option
                .setName('user')
                .setDescription('The user to view history for')
                .setRequired(true),
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

        try {
            const cases = await moderationService.getUserCases(
                interaction.guild.id,
                user.id,
            )

            if (cases.length === 0) {
                await interactionReply({
                    interaction,
                    content: {
                        content: `📋 ${user.tag} has no moderation history.`,
                    },
                })
                return
            }

            const stats = {
                total: cases.length,
                active: cases.filter((c) => c.active).length,
                warns: cases.filter((c) => c.type === 'warn').length,
                mutes: cases.filter((c) => c.type === 'mute').length,
                kicks: cases.filter((c) => c.type === 'kick').length,
                bans: cases.filter((c) => c.type === 'ban').length,
                appeals: cases.filter((c) => c.appealed).length,
            }

            const recentCases = cases.slice(0, 10)

            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle(`📋 Moderation History - ${user.tag}`)
                .setThumbnail(user.displayAvatarURL())
                .addFields(
                    {
                        name: 'Total Cases',
                        value: stats.total.toString(),
                        inline: true,
                    },
                    {
                        name: 'Active Cases',
                        value: stats.active.toString(),
                        inline: true,
                    },
                    {
                        name: 'Appeals',
                        value: stats.appeals.toString(),
                        inline: true,
                    },
                    {
                        name: '⚠️ Warnings',
                        value: stats.warns.toString(),
                        inline: true,
                    },
                    {
                        name: '🔇 Mutes',
                        value: stats.mutes.toString(),
                        inline: true,
                    },
                    {
                        name: '👢 Kicks',
                        value: stats.kicks.toString(),
                        inline: true,
                    },
                    {
                        name: '🔨 Bans',
                        value: stats.bans.toString(),
                        inline: true,
                    },
                )
                .setTimestamp()

            if (recentCases.length > 0) {
                const timeline = recentCases
                    .map((c) => {
                        const status = c.active ? '🟢' : '🔴'
                        const appeal = c.appealed ? '📝' : ''
                        const typeEmoji =
                            {
                                warn: '⚠️',
                                mute: '🔇',
                                unmute: '🔊',
                                kick: '👢',
                                ban: '🔨',
                                unban: '✅',
                                timeout: '⏱️',
                            }[c.type] || '📋'

                        return `${status}${appeal} **#${c.caseNumber}** ${typeEmoji} ${c.type.toUpperCase()} - <t:${Math.floor(c.createdAt.getTime() / 1000)}:R>\n└ ${c.reason || 'No reason'}`
                    })
                    .join('\n\n')

                embed.addFields({ name: 'Recent Cases', value: timeline })
            }

            if (cases.length > 10) {
                embed.setFooter({
                    text: `Showing 10 of ${cases.length} cases. Use /cases user:${user.tag} for full list.`,
                })
            }

            await interactionReply({
                interaction,
                content: { embeds: [embed] },
            })

            infoLog({
                message: `History for ${user.tag} viewed by ${interaction.user.tag} in ${interaction.guild.name}`,
            })
        } catch (error) {
            errorLog({
                message: 'Failed to view user history',
                error: error as Error,
            })

            await interactionReply({
                interaction,
                content: {
                    content:
                        '❌ Failed to view user history. Please try again.',
                },
            })
        }
    },
})
