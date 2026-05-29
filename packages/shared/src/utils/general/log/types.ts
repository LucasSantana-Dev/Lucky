/** Log level constants. */
export const LogLevel = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    SUCCESS: 3,
    DEBUG: 4,
} as const

/** Log level type. */
export type LogLevelType = (typeof LogLevel)[keyof typeof LogLevel]

/** Parameters for logging. */
export type LogParams = {
    message: string
    error?: unknown
    level?: LogLevelType
    data?: unknown
    correlationId?: string
}

/** Log configuration. */
export type LogConfig = {
    level: LogLevelType
    enableColors: boolean
    enableTimestamp: boolean
    enableCorrelationId: boolean
}
