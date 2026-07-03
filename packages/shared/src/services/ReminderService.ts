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

    /** List pending reminders for a user, ordered by remindAt ascending. */
    async listByUserId(
        userId: string,
        limit: number = 10,
    ): Promise<ReminderRecord[]> {
        return await prisma.reminder.findMany({
            where: { userId },
            orderBy: { remindAt: 'asc' },
            take: limit,
        })
    }

    /** Delete a reminder by ID. */
    async deleteById(reminderId: string): Promise<void> {
        await prisma.reminder.delete({ where: { id: reminderId } })
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
