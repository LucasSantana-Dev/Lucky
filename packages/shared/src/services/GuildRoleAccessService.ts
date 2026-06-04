import { getPrismaClient } from '../utils/database/prismaClient.js'

const prisma = getPrismaClient()

/** List of RBAC module types available for guild permissions. */
export const RBAC_MODULES = [
    'overview',
    'settings',
    'moderation',
    'automation',
    'music',
    'integrations',
] as const

/** Guild automation module identifiers. */
export type ModuleKey = (typeof RBAC_MODULES)[number]
/** Guild role access mode. */
export type AccessMode = 'view' | 'manage'
/** Effective access level granted to a user. */
export type EffectiveAccess = 'none' | 'view' | 'manage'

/** Stored role grant mapping modules to access modes. */
export interface RoleGrant {
    guildId: string
    roleId: string
    module: ModuleKey
    mode: AccessMode
    createdAt: Date
    updatedAt: Date
}

/** Input for creating or updating role grants. */
export interface RoleGrantInput {
    roleId: string
    module: ModuleKey
    mode: AccessMode
}

/** Effective access levels across all modules for a user. */
export type EffectiveAccessMap = Record<ModuleKey, EffectiveAccess>

/** Error thrown when RBAC storage is unavailable. */
export class GuildRoleGrantStorageError extends Error {
    readonly code = 'ERR_GUILD_ROLE_GRANT_STORAGE_UNAVAILABLE'
    readonly guildId: string

    constructor(guildId: string, cause?: unknown) {
        super(
            'Guild role access storage is unavailable. Run migrations and retry.',
        )
        this.name = 'GuildRoleGrantStorageError'
        this.guildId = guildId
        if (cause !== undefined) {
            ;(this as Error & { cause?: unknown }).cause = cause
        }
    }
}

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

/** Manages role-based access control for guild modules. */
class GuildRoleAccessService {
    private isMissingTableError(error: unknown): boolean {
        if (typeof error !== 'object' || error === null) {
            return false
        }

        const maybePrismaError = error as { code?: unknown }
        return maybePrismaError.code === 'P2021'
    }

    /** Lists all role grants for a guild. */
    async listRoleGrants(guildId: string): Promise<RoleGrant[]> {
        let rows: Array<{
            guildId: string
            roleId: string
            module: string
            mode: string
            createdAt: Date
            updatedAt: Date
        }> = []

        try {
            rows = await prisma.guildRoleGrant.findMany({
                where: { guildId },
                orderBy: [{ module: 'asc' }, { roleId: 'asc' }],
            })
        } catch (error) {
            if (this.isMissingTableError(error)) {
                throw new GuildRoleGrantStorageError(guildId, error)
            }
            throw error
        }

        const grants = rows
            .map(toRoleGrant)
            .filter((grant): grant is RoleGrant => grant !== null)

        return grants
    }

    /** Replaces all role grants for a guild with the given input. */
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

        try {
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
        } catch (error) {
            if (this.isMissingTableError(error)) {
                throw new GuildRoleGrantStorageError(guildId, error)
            }
            throw error
        }

        return this.listRoleGrants(guildId)
    }

    /** Resolves the effective access map for a user with given roles. */
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

    /** Checks if a user has the required access mode for a module. */
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

    /** Checks if a user has any access to any module. */
    hasAnyAccess(effectiveAccess: EffectiveAccessMap): boolean {
        return RBAC_MODULES.some((module) => effectiveAccess[module] !== 'none')
    }
}

/** Singleton instance of GuildRoleAccessService. */
export const guildRoleAccessService = new GuildRoleAccessService()
