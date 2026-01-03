/**
 * Const objects instead of enums for better tree-shaking and performance
 */

export const CommandCategory = {
    MUSIC: 'music',
    DOWNLOAD: 'download',
    GENERAL: 'general',
    ADMIN: 'admin',
} as const

export const LogLevel = {
    ERROR: 'error',
    WARN: 'warn',
    INFO: 'info',
    DEBUG: 'debug',
} as const

export const QueueRepeatMode = {
    OFF: 0,
    TRACK: 1,
    QUEUE: 2,
    AUTOPLAY: 3,
} as const

export const PlayerState = {
    IDLE: 'idle',
    PLAYING: 'playing',
    PAUSED: 'paused',
    BUFFERING: 'buffering',
    DISCONNECTED: 'disconnected',
} as const

export const TrackSource = {
    YOUTUBE: 'youtube',
    SPOTIFY: 'spotify',
    SOUNDCLOUD: 'soundcloud',
    ATTACHMENT: 'attachment',
} as const

export type CommandCategoryType =
    (typeof CommandCategory)[keyof typeof CommandCategory]
export type LogLevelType = (typeof LogLevel)[keyof typeof LogLevel]
export type QueueRepeatModeType =
    (typeof QueueRepeatMode)[keyof typeof QueueRepeatMode]
export type PlayerStateType = (typeof PlayerState)[keyof typeof PlayerState]
export type TrackSourceType = (typeof TrackSource)[keyof typeof TrackSource]
