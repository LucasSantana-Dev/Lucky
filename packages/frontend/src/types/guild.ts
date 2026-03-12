import type { EffectiveAccessMap } from './rbac'

export interface Guild {
    id: string
    name: string
    icon: string | null
    owner: boolean
    permissions: string
    features: string[]
    memberCount?: number | null
    categoryCount?: number | null
    textChannelCount?: number | null
    voiceChannelCount?: number | null
    roleCount?: number | null
    botAdded: boolean
    effectiveAccess?: EffectiveAccessMap
    canManageRbac?: boolean
}

export interface ServerSettings {
    nickname: string
    commandPrefix: string
    managerRoles: string[]
    updatesChannel: string
    timezone: string
    disableWarnings: boolean
}

export interface ActivityLog {
    id: string
    timestamp: Date
    userId: string
    username: string
    userAvatar: string | null
    action: string
}

export interface LogEntry {
    id: string
    time: Date
    userId: string
    username: string
    action: string
}

export type LogCategory =
    | 'Dashboard'
    | 'Warnings'
    | 'Moderation'
    | 'Automod'
    | 'Commands'
