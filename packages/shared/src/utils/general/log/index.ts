import { LogService } from './service'
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

export { LogLevel } from './types'
export type { LogParams, LogConfig }
export { runWithLogContext, getLogContext } from './context'
export type { LogContext } from './context'
