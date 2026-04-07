import { EmbedBuilder } from 'discord.js'

export type DigestStats = {
    totalCases: number
    activeCases: number
}

export type DigestCase = {
    type: string
    moderatorName: string
    createdAt: Date
}

export type BuildDigestEmbedInput = {
    stats: DigestStats
    cases: DigestCase[]
    days: number
}

const PERIOD_DAYS_MAP: Record<string, number> = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
}

export function resolveDigestPeriodDays(period: string | null | undefined): number {
    if (!period) return 7
    return PERIOD_DAYS_MAP[period] ?? 7
}

export function filterCasesSince(cases: DigestCase[], days: number): DigestCase[] {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    return cases.filter((c) => c.createdAt >= since)
}

export function buildDigestEmbed({
    stats,
    cases,
    days,
}: BuildDigestEmbedInput): EmbedBuilder {
    const periodCases = filterCasesSince(cases, days)

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
                value:
                    periodCases.length > 0
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

    return embed
}
