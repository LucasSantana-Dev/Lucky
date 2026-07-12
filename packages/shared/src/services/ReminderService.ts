import { getPrismaClient } from '../utils/database/prismaClient.js'

const prisma = getPrismaClient()

export type ReminderTarget = 'user' | 'channel' | 'role'

export type ReminderRecord = {
    id: string
    guildId: string
    userId: string
    channelId: string
    message: string
    remindAt: Date
    delivered: boolean
    deliveryAttempts: number
    createdAt: Date
    targetType: string
    roleId: string | null
    deliveryFailed: boolean
}

// Give up after ~1h of 5-minute backoff so an undeliverable reminder
// (user left the guild, DMs closed) can't retry forever.
export const MAX_DELIVERY_ATTEMPTS = 12

export class ReminderService {
    /**
     * Create a reminder. Defaults to a personal ('user') reminder; pass
     * `options.targetType` 'channel' or 'role' for broadcast reminders (role
     * also needs `options.roleId`). `channelId` is the origin channel for
     * personal reminders and the delivery channel for broadcasts.
     */
    async create(
        guildId: string,
        userId: string,
        channelId: string,
        message: string,
        remindAt: Date,
        options?: { targetType?: ReminderTarget; roleId?: string | null },
    ): Promise<ReminderRecord> {
        return await prisma.reminder.create({
            data: {
                guildId,
                userId,
                channelId,
                message,
                remindAt,
                targetType: options?.targetType ?? 'user',
                roleId: options?.roleId ?? null,
            },
        })
    }

    /**
     * Mark a broadcast reminder as failed-and-done: broadcasts are fire-once,
     * so a failure sets deliveryFailed for operator visibility and marks it
     * delivered so the scheduler never retries it.
     */
    async markDeliveryFailed(reminderId: string): Promise<void> {
        await prisma.reminder.update({
            where: { id: reminderId },
            data: { deliveryFailed: true, delivered: true },
        })
    }

    /**
     * List a user's PENDING reminders in one guild, soonest first. Guild
     * scoping keeps reminders from leaking across servers (review P1).
     */
    async listPending(
        guildId: string,
        userId: string,
        limit: number = 10,
    ): Promise<ReminderRecord[]> {
        return await prisma.reminder.findMany({
            where: { guildId, userId, delivered: false },
            orderBy: { remindAt: 'asc' },
            take: limit,
        })
    }

    /**
     * Delete a reminder the caller owns. Ownership enforced at the data layer
     * (id alone is not sufficient). Returns whether a row was deleted.
     */
    async deleteOwned(
        guildId: string,
        userId: string,
        reminderId: string,
    ): Promise<boolean> {
        const result = await prisma.reminder.deleteMany({
            where: { id: reminderId, guildId, userId },
        })
        return result.count > 0
    }

    /**
     * Finds pending reminders whose id matches a prefix, scoped to the owner.
     * Returns up to 2 rows so callers can detect ambiguity without paging
     * through the full list (review P2).
     */
    async findPendingByIdPrefix(
        guildId: string,
        userId: string,
        prefix: string,
    ): Promise<ReminderRecord[]> {
        return await prisma.reminder.findMany({
            where: {
                guildId,
                userId,
                delivered: false,
                id: { startsWith: prefix },
            },
            take: 2,
        })
    }

    /**
     * Records a failed delivery: increments the attempt counter and pushes the
     * next attempt out (backoff). Expiry is driven by the counter, NOT elapsed
     * time from createdAt — a reminder scheduled far in the future must not be
     * dropped on its first failure (review P1). remindAt here is the
     * next-attempt time; the original schedule is irrelevant once due (P2).
     */
    async recordFailedAttempt(
        reminderId: string,
        nextRemindAt: Date,
    ): Promise<void> {
        await prisma.reminder.update({
            where: { id: reminderId },
            data: {
                remindAt: nextRemindAt,
                deliveryAttempts: { increment: 1 },
            },
        })
    }

    /** Fetch undelivered reminders that are due (remindAt <= now). */
    async getDueReminders(limit: number = 25): Promise<ReminderRecord[]> {
        const now = new Date()
        return await prisma.reminder.findMany({
            where: {
                remindAt: { lte: now },
                delivered: false,
            },
            orderBy: { remindAt: 'asc' },
            take: limit,
        })
    }

    /** Mark a reminder as delivered. */
    async markDelivered(reminderId: string): Promise<void> {
        await prisma.reminder.update({
            where: { id: reminderId },
            data: { delivered: true },
        })
    }
}

export const reminderService = new ReminderService()
