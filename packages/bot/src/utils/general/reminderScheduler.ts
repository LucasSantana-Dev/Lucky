import type { Client, TextChannel } from 'discord.js'
import { EmbedBuilder } from '@discordjs/builders'
import { COLOR } from '@lucky/shared/constants'
import { reminderService } from '@lucky/shared/services'
import { errorLog, infoLog } from '@lucky/shared/utils'

const DEFAULT_TICK_INTERVAL_MS = 60 * 1000 // 60 seconds

type ReminderSchedulerOptions = {
    tickIntervalMs?: number
}

export class ReminderScheduler {
    private readonly tickIntervalMs: number
    private timer: ReturnType<typeof setInterval> | null = null
    private client: Client | null = null
    private tickInProgress = false

    constructor(options: ReminderSchedulerOptions = {}) {
        this.tickIntervalMs = options.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS
    }

    start(client: Client): void {
        if (this.timer) return
        this.client = client
        infoLog({
            message: `Reminder scheduler started (interval: ${this.tickIntervalMs}ms)`,
        })
        void this.tick()
        this.timer = setInterval(() => void this.tick(), this.tickIntervalMs)
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer)
            this.timer = null
        }
    }

    async tick(): Promise<void> {
        if (this.tickInProgress || !this.client) return
        this.tickInProgress = true
        try {
            const dueReminders = await reminderService.getDueReminders(25)

            for (const reminder of dueReminders) {
                // Per-reminder isolation: one failure must not abort the batch.
                try {
                    const delivered = await this.deliverReminder(reminder)
                    // Undelivered reminders stay pending and retry next tick;
                    // give up after 24h so they can't clog the due window.
                    const expired =
                        Date.now() - reminder.remindAt.getTime() >
                        24 * 60 * 60 * 1000
                    if (delivered || expired) {
                        await reminderService.markDelivered(reminder.id)
                    }
                } catch (error) {
                    errorLog({
                        message: 'reminder delivery iteration failed',
                        error: error as Error,
                    })
                }
            }

            if (dueReminders.length > 0) {
                infoLog({
                    message: `reminder scheduler delivered ${dueReminders.length} reminders`,
                })
            }
        } catch (error) {
            errorLog({
                message: 'reminder scheduler tick failed',
                error: error as Error,
            })
        } finally {
            this.tickInProgress = false
        }
    }

    /** Returns true when the reminder reached the user via DM or channel. */
    private async deliverReminder(reminder: {
        id: string
        userId: string
        channelId: string
        message: string
        remindAt: Date
    }): Promise<boolean> {
        if (!this.client) return false

        const embed = new EmbedBuilder()
            .setTitle('⏰ Reminder')
            .setDescription(reminder.message)
            .setColor(COLOR.LUCKY_PURPLE)
            .setFooter({ text: `Set for: ${reminder.remindAt.toISOString()}` })
            .setTimestamp()

        try {
            // Try to DM the user first
            const user = await this.client.users.fetch(reminder.userId)
            await user.send({ embeds: [embed.toJSON()] })
            return true
        } catch (dmError) {
            // Fallback: post to origin channel
            try {
                const channel = await this.client.channels.fetch(
                    reminder.channelId,
                )
                if (channel && 'send' in channel) {
                    await (channel as TextChannel).send({
                        content: `<@${reminder.userId}> ⏰ Reminder:`,
                        embeds: [embed.toJSON()],
                        allowedMentions: { parse: ['users'] },
                    })
                    return true
                }
            } catch (channelError) {
                errorLog({
                    message:
                        'Failed to deliver reminder (both DM and channel fallback failed)',
                    error: new Error(
                        `DM error: ${dmError instanceof Error ? dmError.message : String(dmError)}, ` +
                            `Channel error: ${channelError instanceof Error ? channelError.message : String(channelError)}`,
                    ),
                })
            }
        }
        return false
    }
}

export const reminderScheduler = new ReminderScheduler()
