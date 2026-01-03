/**
 * Guild settings types and interfaces
 */

export type GuildSettings = {
    autoplayEnabled: boolean
    maxAutoplayTracks: number
    defaultVolume: number
    repeatMode: number
    lastUpdated: number
}

export type AutoplayCounter = {
    count: number
    lastReset: number
}

export type GuildSettingsConfig = {
    settingsTtl: number
    counterTtl: number
    defaultMaxAutoplayTracks: number
    defaultVolume: number
    defaultRepeatMode: number
    ttl?: number
    maxSize?: number
    cleanupInterval?: number
}
