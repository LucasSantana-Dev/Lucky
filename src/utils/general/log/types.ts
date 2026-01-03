/**
 * Log types and interfaces
 */

export const LogLevel = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    SUCCESS: 3,
    DEBUG: 4,
} as const

export type LogLevelType = (typeof LogLevel)[keyof typeof LogLevel]

export type LogParams = {
    message: string
    error?: unknown
    level?: LogLevelType
    data?: unknown
    correlationId?: string
}

export type LogConfig = {
    level: LogLevelType
    enableColors: boolean
    enableTimestamp: boolean
    enableCorrelationId: boolean
}
