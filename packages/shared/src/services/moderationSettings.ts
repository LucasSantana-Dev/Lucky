import { getPrismaClient } from '../utils/database/prismaClient.js'
import { redisClient } from './redis/index.js'
import { errorLog } from '../utils/general/log.js'
import type { ModerationSettings } from './ModerationService.js'

const prisma = getPrismaClient()
const CACHE_TTL = 300
const CACHE_PREFIX = 'modsettings:'

export async function getModerationSettings(
    guildId: string,
): Promise<ModerationSettings> {
    if (redisClient.isHealthy()) {
        try {
            const cached = await redisClient.get(`${CACHE_PREFIX}${guildId}`)
            if (cached) return JSON.parse(cached)
        } catch (err) {
            errorLog({ message: 'Mod settings cache read error', error: err })
        }
    }

    let settings = await prisma.moderationSettings.findUnique({
        where: { guildId },
    })
    if (!settings) {
        settings = await prisma.moderationSettings.create({ data: { guildId } })
    }

    if (redisClient.isHealthy()) {
        redisClient
            .setex(
                `${CACHE_PREFIX}${guildId}`,
                CACHE_TTL,
                JSON.stringify(settings),
            )
            .catch(() => {})
    }

    return settings
}

export async function updateModerationSettings(
    guildId: string,
    data: Partial<
        Omit<ModerationSettings, 'id' | 'guildId' | 'createdAt' | 'updatedAt'>
    >,
): Promise<ModerationSettings> {
    const result = await prisma.moderationSettings.upsert({
        where: { guildId },
        create: { guildId, ...data },
        update: data,
    })

    if (redisClient.isHealthy()) {
        redisClient.del(`${CACHE_PREFIX}${guildId}`).catch(() => {})
    }

    return result
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
