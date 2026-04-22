import { SlashCommandBuilder, EmbedBuilder } from '@discordjs/builders'
import { COLOR } from '@lucky/shared/constants'
import { getPrismaClient, infoLog, errorLog } from '@lucky/shared/utils'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'

const MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
]

const DAYS_PER_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

function formatBirthday(month: number, day: number): string {
    return `${MONTHS[month - 1]} ${day}`
}

// Days from `from` to the next occurrence of (month, day). 0 = today, 1 =
// tomorrow, ..., 365/366 on the same date next year.
export function daysUntilBirthday(
    from: Date,
    month: number,
    day: number,
): number {
    const year = from.getUTCFullYear()
    const todayUtc = Date.UTC(
        year,
        from.getUTCMonth(),
        from.getUTCDate(),
    )
    let target = Date.UTC(year, month - 1, day)
    if (target < todayUtc) {
        target = Date.UTC(year + 1, month - 1, day)
    }
    const ms = target - todayUtc
    return Math.round(ms / (24 * 60 * 60 * 1000))
}

function validateDate(
    month: number,
    day: number,
): { ok: true } | { ok: false; reason: string } {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
        return { ok: false, reason: 'Month must be between 1 and 12.' }
    }
    if (!Number.isInteger(day) || day < 1 || day > 31) {
        return { ok: false, reason: 'Day must be between 1 and 31.' }
    }
    const maxDay = DAYS_PER_MONTH[month - 1]
    if (day > maxDay) {
        return {
            ok: false,
            reason: `${MONTHS[month - 1]} only has ${maxDay} days.`,
        }
    }
    return { ok: true }
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('birthday')
        .setDescription('🎂 Manage your birthday for this server.')
        .addSubcommand((sub) =>
            sub
                .setName('set')
                .setDescription('Set your birthday (month + day, no year).')
                .addIntegerOption((opt) =>
                    opt
                        .setName('month')
                        .setDescription('Month (1-12)')
                        .setMinValue(1)
                        .setMaxValue(12)
                        .setRequired(true),
                )
                .addIntegerOption((opt) =>
                    opt
                        .setName('day')
                        .setDescription('Day of month (1-31)')
                        .setMinValue(1)
                        .setMaxValue(31)
                        .setRequired(true),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('clear')
                .setDescription('Remove your birthday from this server.'),
        )
        .addSubcommand((sub) =>
            sub
                .setName('list')
                .setDescription(
                    'Show the next upcoming birthdays in this server.',
                ),
        ),
    category: 'general',
    execute: async ({ interaction }) => {
        const guild = interaction.guild
        if (!guild) {
            await interactionReply({
                interaction,
                content: {
                    content: '❌ This command can only be used in a server.',
                },
            })
            return
        }

        const subcommand = interaction.options.getSubcommand()
        const prisma = getPrismaClient()

        try {
            if (subcommand === 'set') {
                const month = interaction.options.getInteger('month', true)
                const day = interaction.options.getInteger('day', true)
                const check = validateDate(month, day)
                if (!check.ok) {
                    await interactionReply({
                        interaction,
                        content: { content: `❌ ${check.reason}` },
                    })
                    return
                }

                await prisma.memberBirthday.upsert({
                    where: {
                        guildId_userId: {
                            guildId: guild.id,
                            userId: interaction.user.id,
                        },
                    },
                    create: {
                        guildId: guild.id,
                        userId: interaction.user.id,
                        month,
                        day,
                    },
                    update: { month, day },
                })

                infoLog({
                    message: `birthday set by ${interaction.user.tag}: ${month}/${day}`,
                    data: { guildId: guild.id },
                })

                const embed = new EmbedBuilder()
                    .setTitle('🎂 Birthday saved')
                    .setDescription(
                        `Got it — I'll celebrate with you on **${formatBirthday(month, day)}** every year.`,
                    )
                    .setColor(COLOR.LUCKY_PURPLE)
                    .setFooter({
                        text: 'Only the date is stored. No year, no age.',
                    })

                await interactionReply({
                    interaction,
                    content: { embeds: [embed.toJSON()] },
                })
                return
            }

            if (subcommand === 'list') {
                const rows = (await prisma.memberBirthday.findMany({
                    where: { guildId: guild.id },
                    select: { userId: true, month: true, day: true },
                })) as Array<{ userId: string; month: number; day: number }>

                if (rows.length === 0) {
                    await interactionReply({
                        interaction,
                        content: {
                            content:
                                'No birthdays set yet. Use `/birthday set` to add yours.',
                        },
                    })
                    return
                }

                const now = new Date()
                const annotated = rows
                    .map((r) => ({
                        ...r,
                        daysUntil: daysUntilBirthday(now, r.month, r.day),
                    }))
                    .sort((a, b) => a.daysUntil - b.daysUntil)
                    .slice(0, 5)

                const lines = annotated.map((r) => {
                    const label =
                        r.daysUntil === 0
                            ? '**today**'
                            : r.daysUntil === 1
                              ? 'tomorrow'
                              : `in ${r.daysUntil} days`
                    return `• <@${r.userId}> — ${formatBirthday(r.month, r.day)} (${label})`
                })

                const embed = new EmbedBuilder()
                    .setTitle('🎂 Upcoming Birthdays')
                    .setDescription(lines.join('\n'))
                    .setColor(COLOR.LUCKY_PURPLE)
                    .setFooter({
                        text: `Showing ${annotated.length} of ${rows.length} · ${guild.name}`,
                    })

                await interactionReply({
                    interaction,
                    content: {
                        embeds: [embed.toJSON()],
                        allowedMentions: { parse: [] },
                    },
                })
                return
            }

            if (subcommand === 'clear') {
                const deleted = await prisma.memberBirthday.deleteMany({
                    where: {
                        guildId: guild.id,
                        userId: interaction.user.id,
                    },
                })
                await interactionReply({
                    interaction,
                    content: {
                        content:
                            deleted.count > 0
                                ? '🧹 Birthday removed.'
                                : 'No birthday was set for you in this server.',
                    },
                })
                return
            }

            await interactionReply({
                interaction,
                content: { content: `❌ Unknown subcommand: ${subcommand}` },
            })
        } catch (error) {
            errorLog({ message: 'birthday command failed', error: error as Error })
            await interactionReply({
                interaction,
                content: { content: '❌ Failed to update birthday. Try again.' },
            })
        }
    },
})
