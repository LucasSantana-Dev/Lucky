import { SlashCommandBuilder, EmbedBuilder } from '@discordjs/builders'
import { PermissionFlagsBits } from 'discord.js'
import type { ChatInputCommandInteraction } from 'discord.js'
import { COLOR } from '@lucky/shared/constants'
import { reminderService } from '@lucky/shared/services'
import {
    buildRecurrenceRule,
    computeNextOccurrence,
    DEFAULT_TIMEZONE,
    isValidTimezone,
    infoLog,
    errorLog,
    type RecurrencePattern,
} from '@lucky/shared/utils'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'

/** Parse duration strings like "10m", "2h", "1d", "30s". Returns milliseconds or null if invalid. */
export function parseDuration(input: string): number | null {
    const match = input.match(/^(\d+)([mhds])$/)
    if (!match) return null

    const value = parseInt(match[1], 10)
    const unit = match[2]

    // Cap at 30 days
    const maxMs = 30 * 24 * 60 * 60 * 1000

    let ms = 0
    switch (unit) {
        case 's':
            ms = value * 1000
            break
        case 'm':
            ms = value * 60 * 1000
            break
        case 'h':
            ms = value * 60 * 60 * 1000
            break
        case 'd':
            ms = value * 24 * 60 * 60 * 1000
            break
        default:
            return null
    }

    if (ms > maxMs) return null
    return ms
}

/**
 * Parse a time-of-day for recurring reminders: 24h ("20:00", "8:30") or 12h
 * ("8PM", "8:30 pm"). Returns {hour, minute} in 0–23 / 0–59, or null if invalid.
 */
export function parseTimeOfDay(
    input: string,
): { hour: number; minute: number } | null {
    const s = input.trim().toLowerCase()

    // 12-hour: 8pm, 8:30pm, "8 pm"
    const twelve = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/)
    if (twelve) {
        let hour = parseInt(twelve[1], 10)
        const minute = twelve[2] ? parseInt(twelve[2], 10) : 0
        if (hour < 1 || hour > 12 || minute > 59) return null
        if (twelve[3] === 'pm' && hour !== 12) hour += 12
        if (twelve[3] === 'am' && hour === 12) hour = 0
        return { hour, minute }
    }

    // 24-hour: 20:00, 8:30
    const twentyFour = s.match(/^(\d{1,2}):(\d{2})$/)
    if (twentyFour) {
        const hour = parseInt(twentyFour[1], 10)
        const minute = parseInt(twentyFour[2], 10)
        if (hour > 23 || minute > 59) return null
        return { hour, minute }
    }

    return null
}

const WEEKDAY_NAMES = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
]

/**
 * Create a recurring reminder from the `set` options. Validates the time-of-day,
 * the weekly day (when repeat = weekly), and the timezone, builds an RRULE, and
 * schedules the first occurrence as `remindAt`.
 */
async function createRecurring(
    interaction: ChatInputCommandInteraction,
    guildId: string,
    mensagem: string,
    repetir: string,
    replyText: (content: string) => Promise<unknown>,
    replyEmbed: (embed: EmbedBuilder) => Promise<unknown>,
): Promise<void> {
    const horarioRaw = interaction.options.getString('horario')
    if (!horarioRaw) {
        await replyText(
            '❌ Recurring reminders need a `horario` (time of day), e.g. 20:00 or 8PM.',
        )
        return
    }
    const time = parseTimeOfDay(horarioRaw)
    if (!time) {
        await replyText('❌ Invalid `horario`. Use 20:00 or 8PM.')
        return
    }

    let weekday: number | undefined
    if (repetir === 'weekly') {
        const dia = interaction.options.getString('dia')
        if (!dia) {
            await replyText(
                '❌ Weekly reminders need a `dia` (which day of the week).',
            )
            return
        }
        weekday = parseInt(dia, 10)
    }

    const fuso = interaction.options.getString('fuso') ?? DEFAULT_TIMEZONE
    if (!isValidTimezone(fuso)) {
        await replyText(
            `❌ Unknown timezone \`${fuso}\`. Use an IANA name like America/Sao_Paulo.`,
        )
        return
    }

    const rule = buildRecurrenceRule(
        repetir as RecurrencePattern,
        time.hour,
        time.minute,
        weekday,
    )
    const remindAt = computeNextOccurrence(rule, fuso, new Date())
    if (!remindAt) {
        await replyText('❌ Could not compute the next occurrence.')
        return
    }

    const reminder = await reminderService.create(
        guildId,
        interaction.user.id,
        interaction.channelId,
        mensagem,
        remindAt,
        { recurrenceRule: rule, timezone: fuso },
    )

    const when =
        repetir === 'weekly'
            ? `every ${WEEKDAY_NAMES[(weekday as number) - 1]}`
            : repetir === 'weekdays'
              ? 'every weekday'
              : repetir === 'weekends'
                ? 'every weekend day'
                : 'every day'
    const hh = String(time.hour).padStart(2, '0')
    const mm = String(time.minute).padStart(2, '0')

    const embed = new EmbedBuilder()
        .setTitle('🔁 Recurring reminder set')
        .setDescription(
            `I'll remind you **${when} at ${hh}:${mm}** (${fuso}) with:\n\n${mensagem}`,
        )
        .setColor(COLOR.LUCKY_PURPLE)
        .setFooter({
            text: `ID: ${reminder.id.slice(0, 8)} · next: ${remindAt.toISOString()}`,
        })

    await replyEmbed(embed)

    infoLog({
        message: `recurring reminder set by ${interaction.user.tag}: ${rule}`,
        data: { guildId, reminderId: reminder.id, timezone: fuso },
    })
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('remind')
        .setDescription('⏰ Manage reminders.')
        .addSubcommand((sub) =>
            sub
                .setName('set')
                .setDescription('Set a one-time or recurring reminder.')
                .addStringOption((opt) =>
                    opt
                        .setName('mensagem')
                        .setDescription('Reminder message (max 500 chars)')
                        .setMaxLength(500)
                        .setRequired(true),
                )
                // One-time: provide `tempo`. Recurring: provide `repetir` +
                // `horario` (both are optional; the handler requires exactly one
                // of the two modes).
                .addStringOption((opt) =>
                    opt
                        .setName('tempo')
                        .setDescription(
                            'One-time duration: 30s, 10m, 2h, 1d (max 30d)',
                        )
                        .setRequired(false),
                )
                .addStringOption((opt) =>
                    opt
                        .setName('repetir')
                        .setDescription('Recurring: how often to repeat')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Every day', value: 'daily' },
                            { name: 'Weekdays (Mon–Fri)', value: 'weekdays' },
                            { name: 'Weekends (Sat–Sun)', value: 'weekends' },
                            { name: 'Weekly (pick a day)', value: 'weekly' },
                        ),
                )
                .addStringOption((opt) =>
                    opt
                        .setName('horario')
                        .setDescription(
                            'Recurring time of day: 20:00 or 8PM (with repetir)',
                        )
                        .setRequired(false),
                )
                .addStringOption((opt) =>
                    opt
                        .setName('dia')
                        .setDescription('Weekly day (only with repetir: weekly)')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Monday', value: '1' },
                            { name: 'Tuesday', value: '2' },
                            { name: 'Wednesday', value: '3' },
                            { name: 'Thursday', value: '4' },
                            { name: 'Friday', value: '5' },
                            { name: 'Saturday', value: '6' },
                            { name: 'Sunday', value: '7' },
                        ),
                )
                .addStringOption((opt) =>
                    opt
                        .setName('fuso')
                        .setDescription(
                            'Timezone (IANA, e.g. America/Sao_Paulo). Default: São Paulo',
                        )
                        .setRequired(false),
                ),
        )
        .addSubcommand((sub) =>
            sub.setName('list').setDescription('Show your pending reminders.'),
        )
        .addSubcommand((sub) =>
            sub
                .setName('delete')
                .setDescription('Delete a reminder by ID.')
                .addStringOption((opt) =>
                    opt
                        .setName('id')
                        .setDescription('Reminder ID to delete')
                        .setRequired(true),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('channel')
                .setDescription(
                    'Post a reminder to a channel (needs Manage Server).',
                )
                .addStringOption((opt) =>
                    opt
                        .setName('tempo')
                        .setDescription('Duration: 30s, 10m, 2h, 1d (max 30d)')
                        .setRequired(true),
                )
                .addStringOption((opt) =>
                    opt
                        .setName('mensagem')
                        .setDescription('Reminder message (max 500 chars)')
                        .setMaxLength(500)
                        .setRequired(true),
                )
                .addChannelOption((opt) =>
                    opt
                        .setName('canal')
                        .setDescription('Channel to post the reminder in')
                        .setRequired(true),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('role')
                .setDescription(
                    'Ping a role with a reminder (needs Manage Server).',
                )
                .addStringOption((opt) =>
                    opt
                        .setName('tempo')
                        .setDescription('Duration: 30s, 10m, 2h, 1d (max 30d)')
                        .setRequired(true),
                )
                .addStringOption((opt) =>
                    opt
                        .setName('mensagem')
                        .setDescription('Reminder message (max 500 chars)')
                        .setMaxLength(500)
                        .setRequired(true),
                )
                .addRoleOption((opt) =>
                    opt
                        .setName('cargo')
                        .setDescription('Role to ping')
                        .setRequired(true),
                )
                .addChannelOption((opt) =>
                    opt
                        .setName('canal')
                        .setDescription('Channel to post the reminder in')
                        .setRequired(true),
                ),
        ),
    category: 'general',
    execute: async ({ interaction }) => {
        // Ephemeral reply helpers — collapse the repeated interactionReply
        // boilerplate (one text, one embed variant).
        const replyText = (content: string) =>
            interactionReply({
                interaction,
                content: { content, ephemeral: true },
            })
        const replyEmbed = (embed: EmbedBuilder) =>
            interactionReply({
                interaction,
                content: { embeds: [embed.toJSON()], ephemeral: true },
            })

        const guild = interaction.guild
        if (!guild) {
            await replyText('❌ This command can only be used in a server.')
            return
        }

        const subcommand = interaction.options.getSubcommand()

        try {
            if (subcommand === 'set') {
                const mensagem = interaction.options.getString('mensagem', true)
                const tempo = interaction.options.getString('tempo')
                const repetir = interaction.options.getString('repetir')

                // Exactly one mode: one-time (`tempo`) XOR recurring (`repetir`).
                if (repetir && tempo) {
                    await replyText(
                        '❌ Use either `tempo` (one-time) or `repetir` (recurring), not both.',
                    )
                    return
                }

                if (repetir) {
                    await createRecurring(
                        interaction,
                        guild.id,
                        mensagem,
                        repetir,
                        replyText,
                        replyEmbed,
                    )
                    return
                }

                if (!tempo) {
                    await replyText(
                        '❌ Provide `tempo` for a one-time reminder (e.g. 10m) or `repetir` for a recurring one.',
                    )
                    return
                }

                const ms = parseDuration(tempo)
                if (ms === null) {
                    await replyText(
                        '❌ Invalid duration. Use format like: 30s, 10m, 2h, 1d (max 30 days)',
                    )
                    return
                }

                const remindAt = new Date(Date.now() + ms)
                const reminder = await reminderService.create(
                    guild.id,
                    interaction.user.id,
                    interaction.channelId,
                    mensagem,
                    remindAt,
                )

                const timeStr = new Intl.RelativeTimeFormat('en', {
                    numeric: 'auto',
                }).format(Math.ceil(ms / 1000 / 60), 'minute')

                const embed = new EmbedBuilder()
                    .setTitle('⏰ Reminder set')
                    .setDescription(
                        `Got it! I'll remind you ${timeStr} with:\n\n${mensagem}`,
                    )
                    .setColor(COLOR.LUCKY_PURPLE)
                    .setFooter({ text: `ID: ${reminder.id.slice(0, 8)}` })

                await replyEmbed(embed)

                infoLog({
                    message: `reminder set by ${interaction.user.tag}: ${tempo}`,
                    data: { guildId: guild.id, reminderId: reminder.id },
                })
                return
            }

            if (subcommand === 'channel' || subcommand === 'role') {
                // Runtime Manage Server gate: broadcast reminders have a wide
                // blast radius (a role ping hits every member). This can't be a
                // setDefaultMemberPermissions on the command — that would gate
                // the personal `set`/`list`/`delete` subcommands too — so it's
                // enforced per-subcommand here (ADR 2026-07-12).
                if (
                    !interaction.memberPermissions?.has(
                        PermissionFlagsBits.ManageGuild,
                    )
                ) {
                    await replyText(
                        '❌ You need the **Manage Server** permission to set channel or role reminders.',
                    )
                    return
                }

                const tempo = interaction.options.getString('tempo', true)
                const mensagem = interaction.options.getString('mensagem', true)

                const ms = parseDuration(tempo)
                if (ms === null) {
                    await replyText(
                        '❌ Invalid duration. Use format like: 30s, 10m, 2h, 1d (max 30 days)',
                    )
                    return
                }

                const canal = interaction.options.getChannel('canal', true)
                const isRole = subcommand === 'role'
                const cargo = isRole
                    ? interaction.options.getRole('cargo', true)
                    : null

                const remindAt = new Date(Date.now() + ms)
                const reminder = await reminderService.create(
                    guild.id,
                    interaction.user.id,
                    canal.id,
                    mensagem,
                    remindAt,
                    {
                        targetType: isRole ? 'role' : 'channel',
                        roleId: cargo?.id ?? null,
                    },
                )

                const target = cargo
                    ? `<@&${cargo.id}> in <#${canal.id}>`
                    : `<#${canal.id}>`
                const embed = new EmbedBuilder()
                    .setTitle('⏰ Reminder scheduled')
                    .setDescription(
                        `I'll remind ${target} with:\n\n${mensagem}`,
                    )
                    .setColor(COLOR.LUCKY_PURPLE)
                    .setFooter({ text: `ID: ${reminder.id.slice(0, 8)}` })

                await replyEmbed(embed)

                infoLog({
                    message: `${subcommand} reminder set by ${interaction.user.tag}: ${tempo}`,
                    data: { guildId: guild.id, reminderId: reminder.id },
                })
                return
            }

            if (subcommand === 'list') {
                const reminders = await reminderService.listPending(
                    guild.id,
                    interaction.user.id,
                    10,
                )

                if (reminders.length === 0) {
                    await replyText(
                        "You don't have any pending reminders. Use `/remind set` to create one.",
                    )
                    return
                }

                const lines = reminders.map((r) => {
                    const when = Math.ceil(
                        (r.remindAt.getTime() - Date.now()) / 1000 / 60,
                    )
                    const whenStr =
                        when > 0
                            ? `in ${when} min`
                            : 'overdue (pending delivery)'
                    // Recurring reminders show a 🔁 and their next fire; the
                    // remindAt is always the NEXT occurrence.
                    const prefix = r.recurrenceRule ? '🔁 ' : '• '
                    const nextStr = r.recurrenceRule
                        ? `next ${whenStr}`
                        : whenStr
                    return `${prefix}${r.message.slice(0, 40)}${r.message.length > 40 ? '…' : ''} — ${nextStr} (ID: ${r.id.slice(0, 8)})`
                })

                const embed = new EmbedBuilder()
                    .setTitle('⏰ Your reminders')
                    .setDescription(lines.join('\n'))
                    .setColor(COLOR.LUCKY_PURPLE)
                    .setFooter({
                        text: `${reminders.length} reminder${reminders.length === 1 ? '' : 's'}`,
                    })

                await replyEmbed(embed)
                return
            }

            if (subcommand === 'delete') {
                const id = interaction.options.getString('id', true)
                // Prefix resolved in the DB (scoped to owner) so it works no
                // matter how many reminders the user has; must be UNIQUE —
                // deleting the first match could remove the wrong one.
                const matches = await reminderService.findPendingByIdPrefix(
                    guild.id,
                    interaction.user.id,
                    id,
                )
                if (matches.length === 0) {
                    await replyText(
                        '❌ Reminder not found. Use `/remind list` to see your reminders.',
                    )
                    return
                }
                if (matches.length > 1) {
                    await replyText(
                        '❌ That ID prefix matches more than one reminder — use more characters of the ID from `/remind list`.',
                    )
                    return
                }
                const reminder = matches[0]

                const deleted = await reminderService.deleteOwned(
                    guild.id,
                    interaction.user.id,
                    reminder.id,
                )
                if (!deleted) {
                    await replyText('❌ Reminder not found.')
                    return
                }

                await replyText(
                    `✅ Reminder deleted: "${reminder.message.slice(0, 50)}${reminder.message.length > 50 ? '…' : ''}"`,
                )

                infoLog({
                    message: `reminder deleted by ${interaction.user.tag}`,
                    data: { guildId: guild.id, reminderId: reminder.id },
                })
            }
        } catch (error) {
            errorLog({
                message: 'remind command error:',
                error,
            })
            try {
                await replyText(
                    '❌ An error occurred while processing your reminder.',
                )
            } catch (replyError) {
                errorLog({
                    message: 'Failed to send error reply for remind command:',
                    error: replyError,
                })
            }
        }
    },
})
