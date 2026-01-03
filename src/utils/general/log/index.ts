import { LogService } from './service'
import type { LogParams, LogConfig, LogLevelType } from './types'

/**
 * Main log service
 */
export class Log {
    private readonly service: LogService

    constructor() {
        this.service = new LogService()
    }

    setLogLevel(level: LogLevelType): void {
        this.service.setLogLevel(level)
    }

    error(params: LogParams): void {
        this.service.error(params)
    }

    warn(params: LogParams): void {
        this.service.warn(params)
    }

    info(params: LogParams): void {
        this.service.info(params)
    }

    success(params: LogParams): void {
        this.service.success(params)
    }

    debug(params: LogParams): void {
        this.service.debug(params)
    }
}

export const log = new Log()

export const setLogLevel = (level: LogLevelType): void => {
    log.setLogLevel(level)
}

export const errorLog = (params: LogParams): void => {
    log.error(params)
}

export const warnLog = (params: LogParams): void => {
    log.warn(params)
}

export const infoLog = (params: LogParams): void => {
    log.info(params)
}

export const successLog = (params: LogParams): void => {
    log.success(params)
}

export const debugLog = (params: LogParams): void => {
    log.debug(params)
}

export { LogLevel } from './types'
export type { LogParams, LogConfig }
