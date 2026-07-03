import { SlashCommandBuilder, EmbedBuilder } from '@discordjs/builders'
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

        try {
            if (subcommand === 'set') {
                const tempo = interaction.options.getString('tempo', true)
                const mensagem = interaction.options.getString('mensagem', true)

                const ms = parseDuration(tempo)
                if (ms === null) {
                    await interactionReply({
                        interaction,
                        content: {
                            content:
                                '❌ Invalid duration. Use format like: 30s, 10m, 2h, 1d (max 30 days)',
                        },
                    })
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

                await interactionReply({
                    interaction,
                    content: { embeds: [embed.toJSON()], ephemeral: true },
                })

                infoLog({
                    message: `reminder set by ${interaction.user.tag}: ${tempo}`,
                    data: { guildId: guild.id, reminderId: reminder.id },
                })
                return
            }

            if (subcommand === 'list') {
                const reminders = await reminderService.listByUserId(
                    interaction.user.id,
                    10,
                )

                if (reminders.length === 0) {
                    await interactionReply({
                        interaction,
                        content: {
                            content:
                                "You don't have any pending reminders. Use `/remind set` to create one.",
                            ephemeral: true,
                        },
                    })
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

                await interactionReply({
                    interaction,
                    content: { embeds: [embed.toJSON()], ephemeral: true },
                })
                return
            }

            if (subcommand === 'delete') {
                const id = interaction.options.getString('id', true)
                const reminders = await reminderService.listByUserId(
                    interaction.user.id,
                )

                const reminder = reminders.find(
                    (r) => r.id.startsWith(id) || r.id === id,
                )
                if (!reminder) {
                    await interactionReply({
                        interaction,
                        content: {
                            content:
                                '❌ Reminder not found. Use `/remind list` to see your reminders.',
                            ephemeral: true,
                        },
                    })
                    return
                }

                await reminderService.deleteById(reminder.id)

                await interactionReply({
                    interaction,
                    content: {
                        content: `✅ Reminder deleted: "${reminder.message.slice(0, 50)}${reminder.message.length > 50 ? '…' : ''}"`,
                        ephemeral: true,
                    },
                })

                infoLog({
                    message: `reminder deleted by ${interaction.user.tag}`,
                    data: { guildId: guild.id, reminderId: reminder.id },
                })
                return
            }
        } catch (error) {
            errorLog({
                message: 'remind command error:',
                error,
            })
            try {
                await interactionReply({
                    interaction,
                    content: {
                        content:
                            '❌ An error occurred while processing your reminder.',
                        ephemeral: true,
                    },
                })
            } catch (replyError) {
                errorLog({
                    message: 'Failed to send error reply for remind command:',
                    error: replyError,
                })
            }
        }
    },
})
