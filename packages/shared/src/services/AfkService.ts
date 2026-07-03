import { getPrismaClient } from '../utils/database/prismaClient.js'

const prisma = getPrismaClient()

/** Represents an AFK status entry. */
export type AfkStatusEntry = {
    id: string
    guildId: string
    userId: string
    reason: string | null
    since: Date
    createdAt: Date
    updatedAt: Date
}

/** Manages AFK status tracking per guild and user. */
export class AfkService {
    /** Sets or updates AFK status for a user in a guild. */
    async set(
        guildId: string,
        userId: string,
        reason?: string,
    ): Promise<AfkStatusEntry> {
        return await prisma.afkStatus.upsert({
            where: { guildId_userId: { guildId, userId } },
            create: { guildId, userId, reason: reason || null },
            update: { reason: reason || null, since: new Date() },
        })
    }

    /** Retrieves AFK status for a user in a guild, or null if not AFK. */
    async get(guildId: string, userId: string): Promise<AfkStatusEntry | null> {
        return await prisma.afkStatus.findUnique({
            where: { guildId_userId: { guildId, userId } },
        })
    }

    /** Clears AFK status for a user in a guild. */
    async clear(guildId: string, userId: string): Promise<void> {
        await prisma.afkStatus.deleteMany({
            where: { guildId, userId },
        })
    }

    /** Retrieves AFK statuses for multiple user IDs in a guild (max 10 to avoid spam). */
    async getMany(
        guildId: string,
        userIds: string[],
    ): Promise<AfkStatusEntry[]> {
        if (userIds.length === 0) return []
        return await prisma.afkStatus.findMany({
            where: {
                guildId,
                userId: { in: userIds.slice(0, 10) }, // limit to 10
            },
        })
    }
}

/** Singleton instance of AfkService. */
export const afkService = new AfkService()
