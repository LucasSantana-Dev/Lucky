export type LogLevel =
    | 'info'
    | 'warn'
    | 'error'
    | 'moderation'
    | 'automod'
    | 'system'

export interface ServerLog {
    id: string
    guildId: string
    type: string
    level: LogLevel
    message: string
    userId?: string
    userName?: string
    channelId?: string
    channelName?: string
    metadata?: Record<string, unknown>
    createdAt: string
}

export interface LogFilter {
    level?: LogLevel
    type?: string
    userId?: string
    startDate?: string
    endDate?: string
    search?: string
}
