import type { TextChannel } from 'discord.js'
import { EmbedBuilder } from '@discordjs/builders'
import { COLOR } from '@lucky/shared/constants'
import type { ReminderRecord } from '@lucky/shared/services'
import { reminderService, MAX_DELIVERY_ATTEMPTS } from '@lucky/shared/services'
import {
    computeNextOccurrence,
    DEFAULT_TIMEZONE,
    errorLog,
    infoLog,
    warnLog,
} from '@lucky/shared/utils'

import { IntervalScheduler } from './IntervalScheduler'

const DEFAULT_TICK_INTERVAL_MS = 60 * 1000 // 60 seconds

type ReminderSchedulerOptions = {
    tickIntervalMs?: number
}

export class ReminderScheduler extends IntervalScheduler {
    constructor(options: ReminderSchedulerOptions = {}) {
        const tickIntervalMs =
            options.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS
        super(tickIntervalMs)
    }

    protected onStart(): void {
        infoLog({
            message: `Reminder scheduler started (interval: ${this.tickIntervalMs}ms)`,
        })
        void this.tick()
    }

    protected async execute(): Promise<void> {
        const dueReminders = await reminderService.getDueReminders(25)

        for (const reminder of dueReminders) {
            // Per-reminder isolation: one failure must not abort the batch.
            try {
                // Broadcast reminders (channel/role) are fire-once — no retry
                // backoff, since there's no future scheduled run to fall back on
                // (matches TwitchNotification/birthday). A failure is logged and
                // flagged for operators, then the reminder is done.
                if (
                    reminder.targetType === 'channel' ||
                    reminder.targetType === 'role'
                ) {
                    await this.deliverBroadcastOnce(reminder)
                    continue
                }

                const delivered = await this.deliverReminder(reminder)
                if (delivered) {
                    // Recurring reminders re-arm for their next occurrence
                    // instead of being marked done; one-time reminders complete.
                    await this.completeOrReschedule(reminder)
                } else if (
                    reminder.deliveryAttempts + 1 >=
                    MAX_DELIVERY_ATTEMPTS
                ) {
                    // Give up after MAX attempts so an undeliverable
                    // reminder can't monopolize the 25-row due window
                    // (review P1) — counter, not elapsed time, so a
                    // future-dated reminder isn't dropped on first failure.
                    await reminderService.markDelivered(reminder.id)
                } else {
                    // Back off 5 minutes and bump the attempt counter.
                    await reminderService.recordFailedAttempt(
                        reminder.id,
                        new Date(Date.now() + 5 * 60 * 1000),
                    )
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
    }

    /**
     * After a successful fire: a one-time reminder is marked delivered; a
     * recurring reminder is re-armed for its next occurrence. If the rule is
     * exhausted (null) or unparseable, stop firing by marking it delivered so a
     * bad rule can't re-fire every tick.
     */
    private async completeOrReschedule(reminder: ReminderRecord): Promise<void> {
        if (!reminder.recurrenceRule) {
            await reminderService.markDelivered(reminder.id)
            return
        }

        let next: Date | null = null
        try {
            next = computeNextOccurrence(
                reminder.recurrenceRule,
                reminder.timezone ?? DEFAULT_TIMEZONE,
                new Date(),
            )
        } catch (error) {
            errorLog({
                message:
                    'recurring reminder: unparseable rule, stopping recurrence',
                error: error as Error,
                data: { reminderId: reminder.id },
            })
        }

        if (next) {
            await reminderService.rescheduleRecurring(reminder.id, next)
        } else {
            await reminderService.markDelivered(reminder.id)
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

    /** Deliver a broadcast (channel/role) reminder exactly once, flagging a
     * failure for operators rather than retrying. */
    private async deliverBroadcastOnce(reminder: {
        id: string
        message: string
        remindAt: Date
        channelId: string
        targetType: string
        roleId: string | null
    }): Promise<void> {
        if (await this.deliverBroadcast(reminder)) {
            await reminderService.markDelivered(reminder.id)
            return
        }
        warnLog({
            message:
                'Broadcast reminder delivery failed (fire-once, not retried)',
            data: {
                reminderId: reminder.id,
                targetType: reminder.targetType,
                channelId: reminder.channelId,
            },
        })
        await reminderService.markDeliveryFailed(reminder.id)
    }

    private async deliverBroadcast(reminder: {
        message: string
        remindAt: Date
        channelId: string
        targetType: string
        roleId: string | null
    }): Promise<boolean> {
        if (!this.client) return false
        const channel = await this.client.channels
            .fetch(reminder.channelId)
            .catch(() => null)
        if (!channel || !('send' in channel)) return false

        const embed = new EmbedBuilder()
            .setTitle('⏰ Reminder')
            .setDescription(reminder.message)
            .setColor(COLOR.LUCKY_PURPLE)
            .setTimestamp()

        const isRolePing =
            reminder.targetType === 'role' && Boolean(reminder.roleId)
        try {
            await (channel as TextChannel).send({
                content: isRolePing ? `<@&${reminder.roleId}>` : undefined,
                embeds: [embed.toJSON()],
                // Scope mentions: a role ping fires only the intended role
                // (never @everyone); a plain channel reminder pings nothing.
                allowedMentions: isRolePing
                    ? { roles: [reminder.roleId as string] }
                    : { parse: [] },
            })
            return true
        } catch {
            return false
        }
    }
}

export const reminderScheduler = new ReminderScheduler()
