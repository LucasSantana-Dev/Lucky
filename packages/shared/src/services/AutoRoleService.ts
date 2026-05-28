import { getPrismaClient } from '../utils/database/prismaClient.js'

const prisma = getPrismaClient()

/** Configuration entry for automatic role assignments with delay. */
export type AutoRoleEntry = {
    id: string
    guildId: string
    roleId: string
    delayMinutes: number
    createdAt: Date
}

/** Manages automatic role assignments for guild members. */
export class AutoRoleService {
    /** Adds or updates an automatic role assignment. */
    async add(
        guildId: string,
        roleId: string,
        delayMinutes = 0,
    ): Promise<AutoRoleEntry> {
        return await prisma.autoRole.upsert({
            where: { guildId_roleId: { guildId, roleId } },
            create: { guildId, roleId, delayMinutes },
            update: { delayMinutes },
        })
    }

    /** Removes an automatic role assignment. */
    async remove(guildId: string, roleId: string): Promise<void> {
        await prisma.autoRole.deleteMany({
            where: { guildId, roleId },
        })
    }

    /** Lists all automatic role assignments for a guild. */
    async list(guildId: string): Promise<AutoRoleEntry[]> {
        return await prisma.autoRole.findMany({
            where: { guildId },
            orderBy: { createdAt: 'asc' },
        })
    }

    /** Alias for list(); gets all automatic roles for a guild. */
    async getAllForGuild(guildId: string): Promise<AutoRoleEntry[]> {
        return await this.list(guildId)
    }
}

/** Singleton instance of AutoRoleService. */
export const autoroleService = new AutoRoleService()
