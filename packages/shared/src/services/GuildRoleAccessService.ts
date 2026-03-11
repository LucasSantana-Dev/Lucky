import { getPrismaClient } from '../utils/database/prismaClient.js'
import { redisClient } from './redis/index.js'
import { errorLog } from '../utils/general/log.js'

const prisma = getPrismaClient()
const CACHE_TTL_SECONDS = 300
const CACHE_PREFIX = 'guild_rbac:'

export const RBAC_MODULES = [
    'overview',
    'settings',
    'moderation',
    'automation',
    'music',
    'integrations',
] as const

export type ModuleKey = (typeof RBAC_MODULES)[number]
export type AccessMode = 'view' | 'manage'
export type EffectiveAccess = 'none' | 'view' | 'manage'

export interface RoleGrant {
    guildId: string
    roleId: string
    module: ModuleKey
    mode: AccessMode
    createdAt: Date
    updatedAt: Date
}

export interface RoleGrantInput {
    roleId: string
    module: ModuleKey
    mode: AccessMode
}

export type EffectiveAccessMap = Record<ModuleKey, EffectiveAccess>

function createEmptyAccessMap(): EffectiveAccessMap {
    return {
        overview: 'none',
        settings: 'none',
        moderation: 'none',
        automation: 'none',
        music: 'none',
        integrations: 'none',
    }
}

function createManageAccessMap(): EffectiveAccessMap {
    return {
        overview: 'manage',
        settings: 'manage',
        moderation: 'manage',
        automation: 'manage',
        music: 'manage',
        integrations: 'manage',
    }
}

function isModuleKey(value: string): value is ModuleKey {
    return RBAC_MODULES.includes(value as ModuleKey)
}

function isAccessMode(value: string): value is AccessMode {
    return value === 'view' || value === 'manage'
}

function isRoleGrantInput(input: RoleGrantInput): boolean {
    return (
        typeof input.roleId === 'string' &&
        input.roleId.length > 0 &&
        isModuleKey(input.module) &&
        isAccessMode(input.mode)
    )
}

function cacheKey(guildId: string): string {
    return `${CACHE_PREFIX}${guildId}`
}

function toRoleGrant(row: {
    guildId: string
    roleId: string
    module: string
    mode: string
    createdAt: Date
    updatedAt: Date
}): RoleGrant | null {
    if (!isModuleKey(row.module) || !isAccessMode(row.mode)) {
        return null
    }

    return {
        guildId: row.guildId,
        roleId: row.roleId,
        module: row.module,
        mode: row.mode,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    }
}

class GuildRoleAccessService {
    private async readCached(guildId: string): Promise<RoleGrant[] | null> {
        if (!redisClient.isHealthy()) {
            return null
        }

        try {
            const value = await redisClient.get(cacheKey(guildId))
            if (!value) {
                return null
            }

            const parsed = JSON.parse(value) as RoleGrant[]
            return parsed
        } catch (error) {
            errorLog({
                message: 'Failed to read RBAC cache',
                error,
            })
            return null
        }
    }

    private async writeCache(
        guildId: string,
        grants: RoleGrant[],
    ): Promise<void> {
        if (!redisClient.isHealthy()) {
            return
        }

        try {
            await redisClient.setex(
                cacheKey(guildId),
                CACHE_TTL_SECONDS,
                JSON.stringify(grants),
            )
        } catch (error) {
            errorLog({
                message: 'Failed to write RBAC cache',
                error,
            })
        }
    }

    private async clearCache(guildId: string): Promise<void> {
        if (!redisClient.isHealthy()) {
            return
        }

        try {
            await redisClient.del(cacheKey(guildId))
        } catch (error) {
            errorLog({
                message: 'Failed to clear RBAC cache',
                error,
            })
        }
    }

    async listRoleGrants(guildId: string): Promise<RoleGrant[]> {
        const cached = await this.readCached(guildId)
        if (cached) {
            return cached
        }

        const rows = await prisma.guildRoleGrant.findMany({
            where: { guildId },
            orderBy: [{ module: 'asc' }, { roleId: 'asc' }],
        })

        const grants = rows
            .map(toRoleGrant)
            .filter((grant): grant is RoleGrant => grant !== null)

        await this.writeCache(guildId, grants)
        return grants
    }

    async replaceRoleGrants(
        guildId: string,
        input: RoleGrantInput[],
    ): Promise<RoleGrant[]> {
        const deduped = new Map<string, RoleGrantInput>()

        for (const item of input) {
            if (!isRoleGrantInput(item)) {
                continue
            }

            const key = `${guildId}:${item.roleId}:${item.module}`
            deduped.set(key, item)
        }

        const values = [...deduped.values()]

        await prisma.$transaction(async (tx) => {
            await tx.guildRoleGrant.deleteMany({
                where: { guildId },
            })

            if (values.length > 0) {
                await tx.guildRoleGrant.createMany({
                    data: values.map((item) => ({
                        guildId,
                        roleId: item.roleId,
                        module: item.module,
                        mode: item.mode,
                    })),
                })
            }
        })

        await this.clearCache(guildId)
        return this.listRoleGrants(guildId)
    }

    async resolveEffectiveAccess(
        guildId: string,
        roleIds: string[],
        isAdminOverride: boolean,
    ): Promise<EffectiveAccessMap> {
        if (isAdminOverride) {
            return createManageAccessMap()
        }

        const grants = await this.listRoleGrants(guildId)
        const roleSet = new Set(roleIds)
        const access = createEmptyAccessMap()

        for (const grant of grants) {
            if (!roleSet.has(grant.roleId)) {
                continue
            }

            if (grant.mode === 'manage') {
                access[grant.module] = 'manage'
                continue
            }

            if (access[grant.module] !== 'manage') {
                access[grant.module] = 'view'
            }
        }

        return access
    }

    hasAccess(
        effectiveAccess: EffectiveAccessMap,
        module: ModuleKey,
        requiredMode: AccessMode,
    ): boolean {
        const current = effectiveAccess[module]

        if (requiredMode === 'view') {
            return current === 'view' || current === 'manage'
        }

        return current === 'manage'
    }

    hasAnyAccess(effectiveAccess: EffectiveAccessMap): boolean {
        return RBAC_MODULES.some((module) => effectiveAccess[module] !== 'none')
    }
}

export const guildRoleAccessService = new GuildRoleAccessService()
