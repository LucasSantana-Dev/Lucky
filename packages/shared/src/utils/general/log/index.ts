import { LogService } from './service'
import { runWithLogContext } from './context'
import type { LogParams, LogConfig, LogLevelType } from './types'

/** Provides logging functionality with multiple severity levels and customizable output. */
export class Log {
    private readonly service: LogService

    constructor() {
        this.service = new LogService()
    }

    /** Sets the minimum log level to display. */
    setLogLevel(level: LogLevelType): void {
        this.service.setLogLevel(level)
    }

    /** Logs an error-level message. */
    error(params: LogParams): void {
        this.service.error(params)
    }

    /** Logs a warning-level message. */
    warn(params: LogParams): void {
        this.service.warn(params)
    }

    /** Logs an info-level message. */
    info(params: LogParams): void {
        this.service.info(params)
    }

    /** Logs a success-level message. */
    success(params: LogParams): void {
        this.service.success(params)
    }

    /** Logs a debug-level message. */
    debug(params: LogParams): void {
        this.service.debug(params)
    }
}

/** Global log instance. */
export const log = new Log()

/** Sets the global minimum log level. */
export const setLogLevel = (level: LogLevelType): void => {
    log.setLogLevel(level)
}

/** Logs an error message using the global log instance. */
export const errorLog = (params: LogParams): void => {
    log.error(params)
}

/** Logs a warning message using the global log instance. */
export const warnLog = (params: LogParams): void => {
    log.warn(params)
}

/** Logs an info message using the global log instance. */
export const infoLog = (params: LogParams): void => {
    log.info(params)
}

/** Logs a success message using the global log instance. */
export const successLog = (params: LogParams): void => {
    log.success(params)
}

/** Logs a debug message using the global log instance. */
export const debugLog = (params: LogParams): void => {
    log.debug(params)
}

/**
 * Emits a low-cardinality activation-telemetry event as a single info-level
 * log line: `{event, ...fields}`. Always runs inside a FRESH log context
 * (`runWithLogContext({}, ...)`).
 *
 * `LogService` merges the ambient AsyncLocalStorage context into `data` for
 * any identity field (`correlationId`/`guildId`/`userId`) the caller does not
 * explicitly provide, AND hoists a `userId`/`correlationId` key found inside
 * `data` itself to a top-level JSON field (see `log/service.ts`'s
 * `extractJsonFields`). Resetting the context only closes the first path —
 * a caller that (accidentally) passes `userId`/`correlationId` in `fields`
 * would still have it hoisted and logged. These events are read in aggregate
 * (Grafana panels) and must never carry a per-user identifier or free-text
 * content, so both paths are closed here: the context is reset to empty, AND
 * `userId`/`correlationId` are stripped from `fields` before they ever reach
 * `data`.
 */
export const telemetryLog = (
    event: string,
    fields: Record<string, string | boolean | undefined> = {},
): void => {
    const {
        userId: _userId,
        correlationId: _correlationId,
        ...safeFields
    } = fields
    runWithLogContext({}, () => {
        infoLog({ message: event, data: { event, ...safeFields } })
    })
}

export { LogLevel } from './types'
export type { LogParams, LogConfig }
export { runWithLogContext, getLogContext } from './context'
export type { LogContext } from './context'
