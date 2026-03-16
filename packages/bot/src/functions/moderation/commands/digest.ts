import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
} from 'discord.js'
import Command from '../../../models/Command.js'
import { moderationService } from '@lucky/shared/services'
import { infoLog, errorLog } from '@lucky/shared/utils'
import { interactionReply } from '../../../utils/general/interactionReply.js'

const PERIOD_DAYS: Record<string, number> = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('digest')
        .setDescription('📊 Show a moderation activity digest for this server.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addStringOption((option) =>
            option
                .setName('period')
                .setDescription('Time period to summarise (default: 7d)')
                .setRequired(false)
                .addChoices(
                    { name: 'Last 7 days', value: '7d' },
                    { name: 'Last 30 days', value: '30d' },
                    { name: 'Last 90 days', value: '90d' },
                ),
        ),
    category: 'moderation',
    execute: async ({ interaction }) => {
        if (!interaction.guild) {
            await interactionReply({
                interaction,
                content: { content: '❌ This command can only be used in a server.' },
            })
            return
        }

        const period = interaction.options.getString('period') ?? '7d'
        const days = PERIOD_DAYS[period] ?? 7
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

        try {
            const [stats, recentCases] = await Promise.all([
                moderationService.getStats(interaction.guild.id),
                moderationService.getRecentCases(interaction.guild.id, 500),
            ])

            const periodCases = recentCases.filter((c) => c.createdAt >= since)

            const periodByType: Record<string, number> = {}
            for (const c of periodCases) {
                periodByType[c.type] = (periodByType[c.type] ?? 0) + 1
            }

            const typeLines = Object.entries(periodByType)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => `• **${type.toUpperCase()}**: ${count}`)
                .join('\n')

            const topModerators: Record<string, number> = {}
            for (const c of periodCases) {
                topModerators[c.moderatorName] = (topModerators[c.moderatorName] ?? 0) + 1
            }
            const topModLines = Object.entries(topModerators)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([name, count]) => `• **${name}**: ${count} action${count !== 1 ? 's' : ''}`)
                .join('\n')

            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle(`📊 Moderation Digest — Last ${days} days`)
                .addFields(
                    {
                        name: '📈 All-time totals',
                        value: [
                            `Total cases: **${stats.totalCases}**`,
                            `Active cases: **${stats.activeCases}**`,
                        ].join('\n'),
                        inline: false,
                    },
                    {
                        name: `🗂️ Actions in the last ${days} days`,
                        value: periodCases.length > 0
                            ? `**${periodCases.length}** total\n${typeLines}`
                            : 'No actions recorded.',
                        inline: false,
                    },
                )

            if (topModLines) {
                embed.addFields({
                    name: '🏅 Top moderators',
                    value: topModLines,
                    inline: false,
                })
            }

            embed.setTimestamp().setFooter({ text: `Period: last ${days} days` })

            await interactionReply({ interaction, content: { embeds: [embed] } })

            infoLog({
                message: `Mod digest viewed by ${interaction.user.tag} in ${interaction.guild.name} (period: ${period})`,
            })
        } catch (error) {
            errorLog({ message: 'Failed to generate mod digest', error: error as Error })
            await interactionReply({
                interaction,
                content: { content: '❌ Failed to generate digest. Please try again.' },
            })
        }
    },
})
