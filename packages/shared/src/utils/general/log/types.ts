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

/**
 * Token written at the start of every log line so shippers can read the
 * severity. The level was previously carried only by ANSI colour, which no
 * shipper can parse: Loki's `level` label was empty for INFO/WARN and only
 * ever matched lines whose *content* happened to contain "ERROR" (a track
 * titled "BARRE DI TERRORE" labelled routine playback as an error). See #2054.
 *
 * SUCCESS maps to INFO because it is an informational outcome, and downstream
 * (promtail, Grafana) has no SUCCESS bucket to route it to.
 */
export const LEVEL_TOKEN: Record<LogLevelType, string> = {
    [LogLevel.ERROR]: 'ERROR',
    [LogLevel.WARN]: 'WARN',
    [LogLevel.INFO]: 'INFO',
    [LogLevel.SUCCESS]: 'INFO',
    [LogLevel.DEBUG]: 'DEBUG',
}

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
