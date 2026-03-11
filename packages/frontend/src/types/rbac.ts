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
export type EffectiveAccessMap = Record<ModuleKey, EffectiveAccess>

export interface RoleGrant {
    roleId: string
    module: ModuleKey
    mode: AccessMode
}

export interface GuildRoleOption {
    id: string
    name: string
    color: number
    position: number
}

export interface GuildMemberContext {
    guildId: string
    nickname: string | null
    username: string
    globalName: string | null
    roleIds: string[]
    effectiveAccess: EffectiveAccessMap
    canManageRbac: boolean
}
