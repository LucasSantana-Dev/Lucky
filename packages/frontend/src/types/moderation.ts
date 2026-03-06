export type ModerationActionType =
    | 'warn'
    | 'mute'
    | 'kick'
    | 'ban'
    | 'unban'
    | 'unmute'

export interface ModerationCase {
    id: string
    caseNumber: number
    guildId: string
    userId: string
    userName?: string
    userAvatar?: string
    moderatorId: string
    moderatorName?: string
    type: ModerationActionType
    reason: string | null
    duration: number | null
    expiresAt: string | null
    active: boolean
    appealed: boolean
    appealReason: string | null
    createdAt: string
    updatedAt: string
}

export interface ModerationSettings {
    guildId: string
    logChannelId: string | null
    muteRoleId: string | null
    dmOnAction: boolean
    defaultAction: ModerationActionType
}

export interface ModerationStats {
    totalCases: number
    activeCases: number
    recentCases: number
    casesByType: Record<ModerationActionType, number>
}
