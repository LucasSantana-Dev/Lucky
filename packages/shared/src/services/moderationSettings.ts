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
    const settings = await prisma().moderationSettings.upsert({
        where: { guildId },
        create: { guildId },
        update: {},
    })

    return settings
}

// The guild id doubles as the @everyone role id, so storing it as a mod,
// admin or mute role would apply to every member (#2600, #2630). The backend
// route rejects it too; this guards every other writer.
function assertNoEveryoneRole(
    guildId: string,
    data: Partial<ModerationSettings>,
): void {
    const roleIds = [
        data.muteRoleId,
        ...(data.modRoleIds ?? []),
        ...(data.adminRoleIds ?? []),
    ]
    if (roleIds.includes(guildId)) {
        throw new Error(
            'The @everyone role (guild id) cannot be a moderation role',
        )
    }
}

/** Updates or creates moderation settings for a guild. */
export async function updateModerationSettings(
    guildId: string,
    data: Partial<
        Omit<ModerationSettings, 'id' | 'guildId' | 'createdAt' | 'updatedAt'>
    >,
): Promise<ModerationSettings> {
    assertNoEveryoneRole(guildId, data)
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
    // Every member holds @everyone; ignore it so a row stored before the
    // write guard cannot make the whole guild moderators (#2630).
    return userRoles.some(
        (roleId) =>
            roleId !== guildId &&
            (settings.modRoleIds.includes(roleId) ||
                settings.adminRoleIds.includes(roleId)),
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
