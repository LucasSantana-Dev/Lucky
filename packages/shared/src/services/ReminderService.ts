import { getPrismaClient } from '../utils/database/prismaClient.js'

const prisma = getPrismaClient()

export type ReminderRecord = {
    id: string
    guildId: string
    userId: string
    channelId: string
    message: string
    remindAt: Date
    delivered: boolean
    createdAt: Date
}

export class ReminderService {
    /** Create a new reminder for a user. */
    async create(
        guildId: string,
        userId: string,
        channelId: string,
        message: string,
        remindAt: Date,
    ): Promise<ReminderRecord> {
        return await prisma.reminder.create({
            data: {
                guildId,
                userId,
                channelId,
                message,
                remindAt,
            },
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

    /** Reschedules a failed delivery a few minutes out (retry backoff). */
    async rescheduleDelivery(reminderId: string, remindAt: Date): Promise<void> {
        await prisma.reminder.update({
            where: { id: reminderId },
            data: { remindAt },
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
