import { SlashCommandBuilder, EmbedBuilder } from '@discordjs/builders'
import { ChannelType, PermissionFlagsBits } from 'discord.js'
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
                .setName('channel')
                .setDescription(
                    'Set the channel where birthday announcements post (Manage Server only).',
                )
                .addChannelOption((opt) =>
                    opt
                        .setName('channel')
                        .setDescription(
                            'Text channel for announcements, or leave empty to disable.',
                        )
                        .addChannelTypes(ChannelType.GuildText),
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

            if (subcommand === 'channel') {
                const member = interaction.member
                const hasPerm =
                    typeof member?.permissions === 'object' &&
                    'has' in member.permissions &&
                    (
                        member.permissions as {
                            has: (p: bigint) => boolean
                        }
                    ).has(PermissionFlagsBits.ManageGuild)
                if (!hasPerm) {
                    await interactionReply({
                        interaction,
                        content: {
                            content:
                                '❌ You need the **Manage Server** permission to configure the birthday channel.',
                        },
                    })
                    return
                }
                const channel = interaction.options.getChannel('channel')
                const channelId = channel?.id ?? null
                await prisma.guildSettings.upsert({
                    where: { guildId: guild.id },
                    create: { guildId: guild.id, birthdayChannelId: channelId },
                    update: { birthdayChannelId: channelId },
                })
                await interactionReply({
                    interaction,
                    content: {
                        content: channelId
                            ? `✅ Birthday announcements will post to <#${channelId}>.`
                            : '🔕 Birthday announcements disabled (no channel set).',
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
