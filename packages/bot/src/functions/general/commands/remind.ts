import { SlashCommandBuilder, EmbedBuilder } from '@discordjs/builders'
import { PermissionFlagsBits } from 'discord.js'
import { COLOR } from '@lucky/shared/constants'
import { reminderService } from '@lucky/shared/services'
import { infoLog, errorLog } from '@lucky/shared/utils'
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

export default new Command({
    data: new SlashCommandBuilder()
        .setName('remind')
        .setDescription('⏰ Manage reminders.')
        .addSubcommand((sub) =>
            sub
                .setName('set')
                .setDescription('Set a reminder.')
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
                const tempo = interaction.options.getString('tempo', true)
                const mensagem = interaction.options.getString('mensagem', true)

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
                    return `• ${r.message.slice(0, 40)}${r.message.length > 40 ? '…' : ''} — ${whenStr} (ID: ${r.id.slice(0, 8)})`
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
