import { getPrismaClient } from '../utils/database/prismaClient.js'
import type { PrismaClient } from '../generated/prisma/client.js'
import type { ModerationSettings } from './ModerationService.js'

let prismaInstance: PrismaClient | null = null

function prisma(): PrismaClient {
    if (!prismaInstance) {
        prismaInstance = getPrismaClient()
    }
    return prismaInstance
}

/** Retrieves moderation settings for a guild. */
export async function getModerationSettings(
    guildId: string,
): Promise<ModerationSettings> {
    let settings = await prisma().moderationSettings.findUnique({
        where: { guildId },
    })
    if (!settings) {
        settings = await prisma().moderationSettings.create({
            data: { guildId },
        })
    }

    return settings
}

/** Updates or creates moderation settings for a guild. */
export async function updateModerationSettings(
    guildId: string,
    data: Partial<
        Omit<ModerationSettings, 'id' | 'guildId' | 'createdAt' | 'updatedAt'>
    >,
): Promise<ModerationSettings> {
    const result = await prisma().moderationSettings.upsert({
        where: { guildId },
        create: { guildId, ...data },
        update: data,
    })

    return result
}

/** Checks if a user has moderation permissions in a guild. */
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

/** Retrieves aggregated moderation case statistics for a guild. */
export async function getModerationStats(guildId: string) {
    const [totalCases, activeCases, casesByType] = await Promise.all([
        prisma().moderationCase.count({ where: { guildId } }),
        prisma().moderationCase.count({ where: { guildId, active: true } }),
        prisma().moderationCase.groupBy({
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
