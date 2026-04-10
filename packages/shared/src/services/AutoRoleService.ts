import { getPrismaClient } from '../utils/database/prismaClient.js'

const prisma = getPrismaClient()

export type AutoRoleEntry = {
    id: string
    guildId: string
    roleId: string
    delayMinutes: number
    createdAt: Date
}

export class AutoRoleService {
    async add(guildId: string, roleId: string, delayMinutes = 0): Promise<AutoRoleEntry> {
        return await prisma.autoRole.upsert({
            where: { guildId_roleId: { guildId, roleId } },
            create: { guildId, roleId, delayMinutes },
            update: { delayMinutes },
        })
    }

    async remove(guildId: string, roleId: string): Promise<void> {
        await prisma.autoRole.deleteMany({
            where: { guildId, roleId },
        })
    }

    async list(guildId: string): Promise<AutoRoleEntry[]> {
        return await prisma.autoRole.findMany({
            where: { guildId },
            orderBy: { createdAt: 'asc' },
        })
    }

    async getAllForGuild(guildId: string): Promise<AutoRoleEntry[]> {
        return await this.list(guildId)
    }
}

export const autoroleService = new AutoRoleService()
