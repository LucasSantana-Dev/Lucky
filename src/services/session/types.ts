/**
 * Session types and interfaces
 */

export type UserSession = {
    userId: string
    guildId: string
    channelId: string
    lastActivity: number
    commandHistory: string[]
    preferences: Record<string, unknown>
}

export type QueueSession = {
    guildId: string
    channelId: string
    voiceChannelId: string
    lastTrackId?: string
    queuePosition: number
    isPlaying: boolean
    volume: number
    repeatMode: number
    lastUpdated: number
}

export type SessionConfig = {
    userSessionTtl: number
    queueSessionTtl: number
    maxCommandHistory: number
    sessionCleanupInterval: number
    ttl?: number
    maxSize?: number
    cleanupInterval?: number
}
