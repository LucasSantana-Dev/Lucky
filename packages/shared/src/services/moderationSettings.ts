import { getPrismaClient } from '../utils/database/prismaClient.js'
import type { ModerationSettings } from './ModerationService.js'

// Workaround: Type assertion for Prisma client with moderation models
const prisma = getPrismaClient() as any

export async function getModerationSettings(
    guildId: string,
): Promise<ModerationSettings> {
    let settings = await prisma.moderationSettings.findUnique({
        where: { guildId },
    })
    if (!settings) {
        settings = await prisma.moderationSettings.create({ data: { guildId } })
    }
    return settings
}

export async function updateModerationSettings(
    guildId: string,
    data: Partial<
        Omit<ModerationSettings, 'id' | 'guildId' | 'createdAt' | 'updatedAt'>
    >,
): Promise<ModerationSettings> {
    return await prisma.moderationSettings.upsert({
        where: { guildId },
        create: { guildId, ...data },
        update: data,
    })
}

export async function hasModPermissions(
    guildId: string,
    userRoles: string[],
): Promise<boolean> {
    const settings = await getModerationSettings(guildId)
    return userRoles.some(
        (roleId) =>
            settings.modRoleIds.includes(roleId) ||
            settings.adminRoleIds.includes(roleId),
    )
}

export async function getModerationStats(guildId: string) {
    const [totalCases, activeCases, casesByType] = await Promise.all([
        prisma.moderationCase.count({ where: { guildId } }),
        prisma.moderationCase.count({ where: { guildId, active: true } }),
        prisma.moderationCase.groupBy({
            by: ['type'],
            where: { guildId },
            _count: true,
        }),
    ])
    return {
        totalCases,
        activeCases,
        casesByType: Object.fromEntries(
            casesByType.map((item: { type: string; _count: number }) => [
                item.type,
                item._count,
            ]),
        ),
    }
}
