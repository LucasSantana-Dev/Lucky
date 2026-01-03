/**
 * Queue session manager types and interfaces
 */

export type QueueSession = {
    guildId: string
    channelId: string
    voiceChannelId: string
    lastTrackId?: string
    queuePosition: number
    currentPosition?: number
    isPlaying: boolean
    volume: number
    repeatMode: number
    lastUpdated: number
}

export type SessionConfig = {
    queueSessionTtl: number
    userSessionTtl: number
}

export type QueueSessionOptions = {
    guildId: string
    channelId: string
    voiceChannelId: string
    volume?: number
    repeatMode?: number
}
