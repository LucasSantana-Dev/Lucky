export interface Guild {
    id: string
    name: string
    icon: string | null
    owner: boolean
    permissions: string
    features: string[]
    memberCount?: number
    categoryCount?: number
    textChannelCount?: number
    voiceChannelCount?: number
    roleCount?: number
    botAdded: boolean
}

export interface ServerSettings {
    nickname: string
    commandPrefix: string
    managerRoles: string[]
    updatesChannel: string
    timezone: string
    disableWarnings: boolean
}

export interface ServerListing {
    listed: boolean
    description: string
    inviteUrl: string
    defaultInviteChannel: string
    language: string
    categories: string[]
    tags: string[]
    youtubeUrl?: string
    twitterUrl?: string
    twitchUrl?: string
    redditUrl?: string
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
