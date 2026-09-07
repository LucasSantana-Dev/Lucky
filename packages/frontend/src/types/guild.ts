import type { EffectiveAccessMap } from './rbac'

export type { GuildChannelOption, GuildEmojiOption } from '@lucky/shared/types'

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
    prefix: string
    embedColor: string
    language: string
    allowPlaylists: boolean
    allowSpotify: boolean
    commandCooldown: number
    maxQueueSize: number
    defaultVolume: number
    voteSkipThreshold: number
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
    'Dashboard' | 'Warnings' | 'Moderation' | 'Automod' | 'Commands'
