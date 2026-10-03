import { ButtonStyle, RESTJSONErrorCodes } from 'discord.js'
import type { TextChannel } from 'discord.js'
import {
    ActionRowBuilder,
    ButtonBuilder,
    EmbedBuilder,
} from '@discordjs/builders'
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

import { REMINDER_STOP_BUTTON_PREFIX } from '../../functions/general/reminderStopButton'
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

        let deliveredCount = 0
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
                    if (await this.deliverBroadcastOnce(reminder)) {
                        deliveredCount++
                    }
                    continue
                }

                // Personal reminders only: a reminder whose owner left the
                // server (or whose server dropped the bot) is cancelled, not
                // re-armed forever (#2619).
                const membership = await this.checkMembership(reminder)
                if (membership === 'skip') continue
                if (membership !== 'ok') {
                    await reminderService.markDelivered(reminder.id)
                    infoLog({
                        message:
                            'reminder cancelled: owner can no longer receive it',
                        data: { reminderId: reminder.id, reason: membership },
                    })
                    continue
                }

                const delivered = await this.deliverReminder(reminder)
                if (delivered) {
                    deliveredCount++
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

        if (deliveredCount > 0) {
            infoLog({
                message: `reminder scheduler delivered ${deliveredCount} reminders`,
            })
        }
    }

    /**
     * After a successful fire: a one-time reminder is marked delivered; a
     * recurring reminder is re-armed for its next occurrence. If the rule is
     * exhausted (null) or unparseable, stop firing by marking it delivered so a
     * bad rule can't re-fire every tick.
     */
    private async completeOrReschedule(
        reminder: ReminderRecord,
    ): Promise<void> {
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

    /**
     * Membership gate for personal reminders. `skip` leaves the row untouched
     * (gateway not ready, so the guild cache is not trustworthy); a cancel
     * reason means the reminder must never be delivered; any other fetch
     * error fails open so a transient API blip cannot drop a reminder.
     */
    private async checkMembership(reminder: {
        guildId: string
        userId: string
    }): Promise<'ok' | 'skip' | 'bot_left_guild' | 'user_left_guild'> {
        if (!this.client || !this.client.isReady()) return 'skip'
        const guild = this.client.guilds.cache.get(reminder.guildId)
        if (!guild) return 'bot_left_guild'
        try {
            // force: bypass the member cache, which can be stale after a missed
            // GuildMemberRemove and would hide that the user left.
            await guild.members.fetch({ user: reminder.userId, force: true })
        } catch (error) {
            if (
                (error as { code?: unknown })?.code ===
                RESTJSONErrorCodes.UnknownMember
            ) {
                return 'user_left_guild'
            }
        }
        return 'ok'
    }

    /** Returns true when the reminder reached the user via DM or channel. */
    private async deliverReminder(reminder: {
        id: string
        userId: string
        channelId: string
        message: string
        remindAt: Date
        recurrenceRule: string | null
    }): Promise<boolean> {
        if (!this.client) return false

        const embed = new EmbedBuilder()
            .setTitle('⏰ Reminder')
            .setDescription(reminder.message)
            .setColor(COLOR.LUCKY_PURPLE)
            .setFooter({ text: `Set for: ${reminder.remindAt.toISOString()}` })
            .setTimestamp()

        // Recurring reminders carry a Stop button so the owner can end them
        // from the message itself; one-time reminders have nothing to stop.
        const components = reminder.recurrenceRule
            ? [
                  new ActionRowBuilder<ButtonBuilder>().addComponents(
                      new ButtonBuilder()
                          .setCustomId(
                              `${REMINDER_STOP_BUTTON_PREFIX}${reminder.id}`,
                          )
                          .setLabel('Stop this reminder')
                          .setStyle(ButtonStyle.Danger),
                  ),
              ]
            : undefined

        try {
            // Try to DM the user first
            const user = await this.client.users.fetch(reminder.userId)
            await user.send({
                embeds: [embed.toJSON()],
                ...(components ? { components } : {}),
            })
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
                        ...(components ? { components } : {}),
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
    }): Promise<boolean> {
        if (await this.deliverBroadcast(reminder)) {
            await reminderService.markDelivered(reminder.id)
            return true
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
        return false
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
