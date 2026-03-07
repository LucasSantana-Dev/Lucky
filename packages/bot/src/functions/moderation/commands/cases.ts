import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from 'discord.js'
import Command from '../../../models/Command.js'
import { moderationService } from '@nexus/shared/services'
import { infoLog, errorLog } from '@nexus/shared/utils'
import { interactionReply } from '../../../utils/general/interactionReply.js'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('cases')
        .setDescription('List moderation cases')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption((option) =>
            option
                .setName('user')
                .setDescription('Filter cases by user')
                .setRequired(false),
        )
        .addStringOption((option) =>
            option
                .setName('type')
                .setDescription('Filter cases by type')
                .setRequired(false)
                .addChoices(
                    { name: 'Warn', value: 'warn' },
                    { name: 'Mute', value: 'mute' },
                    { name: 'Unmute', value: 'unmute' },
                    { name: 'Kick', value: 'kick' },
                    { name: 'Ban', value: 'ban' },
                    { name: 'Unban', value: 'unban' },
                    { name: 'Timeout', value: 'timeout' },
                ),
        )
        .addIntegerOption((option) =>
            option
                .setName('page')
                .setDescription('Page number')
                .setRequired(false)
                .setMinValue(1),
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

        const user = interaction.options.getUser('user')
        const type = interaction.options.getString('type') as
            | 'warn'
            | 'mute'
            | 'kick'
            | 'ban'
            | 'timeout'
            | 'unban'
            | 'unmute'
            | null
        const page = interaction.options.getInteger('page') || 1
        const perPage = 10

        try {
            let cases
            let totalCases = 0

            if (user) {
                cases = await moderationService.getUserCases(
                    interaction.guild.id,
                    user.id,
                    false,
                )
                if (type) {
                    cases = cases.filter((c) => c.type === type)
                }
                totalCases = cases.length
                cases = cases.slice((page - 1) * perPage, page * perPage)
            } else {
                const stats = await moderationService.getStats(
                    interaction.guild.id,
                )
                totalCases = stats.totalCases

                const allCases = await moderationService.getRecentCases(
                    interaction.guild.id,
                    1000,
                )
                cases = type
                    ? allCases.filter((c) => c.type === type)
                    : allCases
                totalCases = cases.length
                cases = cases.slice((page - 1) * perPage, page * perPage)
            }

            if (cases.length === 0) {
                await interactionReply({
                    interaction,
                    content: {
                        content: '📋 No cases found matching the criteria.',
                    },
                })
                return
            }

            const totalPages = Math.ceil(totalCases / perPage)

            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle('📋 Moderation Cases')
                .setDescription(
                    cases
                        .map((c) => {
                            const status = c.active ? '🟢' : '🔴'
                            const appeal = c.appealed ? '📝' : ''
                            return `${status}${appeal} **#${c.caseNumber}** - ${c.type.toUpperCase()} - ${c.username} - <t:${Math.floor(c.createdAt.getTime() / 1000)}:R>`
                        })
                        .join('\n'),
                )
                .setFooter({
                    text: `Page ${page}/${totalPages} • Total Cases: ${totalCases}`,
                })
                .setTimestamp()

            if (user) {
                embed.addFields({
                    name: 'Filtered By',
                    value: `User: ${user.tag}`,
                })
            }

            if (type) {
                embed.addFields({
                    name: 'Type Filter',
                    value: type.toUpperCase(),
                })
            }

            const components = []
            if (totalPages > 1) {
                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`cases_prev_${page}`)
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === 1),
                    new ButtonBuilder()
                        .setCustomId(`cases_next_${page}`)
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === totalPages),
                )
                components.push(row)
            }

            await interactionReply({
                interaction,
                content: { embeds: [embed], components },
            })

            infoLog({
                message: `Cases list viewed by ${interaction.user.tag} in ${interaction.guild.name}`,
            })
        } catch (error) {
            errorLog({
                message: 'Failed to list cases',
                error: error as Error,
            })

            await interactionReply({
                interaction,
                content: {
                    content: '❌ Failed to list cases. Please try again.',
                },
            })
        }
    },
})
