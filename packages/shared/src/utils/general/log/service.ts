import chalk from 'chalk'
import {
    addBreadcrumb,
    captureException,
    captureMessage,
} from '../../monitoring'
import { recordWithCooldown, emitAlert } from '../../alerts'
import { getLogContext } from './context'
import type { LogLevelType, LogParams, LogConfig } from './types'

function serializeError(err: unknown): string {
    if (err instanceof Error) {
        return `${err.name}: ${err.message}\n${err.stack ?? ''}`
    }
    try {
        return JSON.stringify(err, null, 2)
    } catch {
        return String(err)
    }
}

function toError(err: unknown): Error {
    if (err instanceof Error) return err
    return new Error(typeof err === 'string' ? err : JSON.stringify(err))
}

/**
 * Log service
 */
export class LogService {
    private readonly config: LogConfig = {
        level: 4, // DEBUG
        enableColors: true,
        enableTimestamp: true,
        enableCorrelationId: true,
    }

    setLogLevel(level: LogLevelType): void {
        this.config.level = level
    }

    private shouldLog(level: LogLevelType): boolean {
        return level <= this.config.level
    }

    private formatMessage(params: LogParams): string {
        const { message, correlationId } = params
        let formattedMessage = message

        if (this.config.enableTimestamp) {
            const timestamp = new Date().toISOString()
            formattedMessage = `[${timestamp}] ${formattedMessage}`
        }

        if (this.config.enableCorrelationId && correlationId) {
            formattedMessage = `[${correlationId}] ${formattedMessage}`
        }

        return formattedMessage
    }

    private getColor(level: LogLevelType): (text: string) => string {
        if (!this.config.enableColors) {
            return (text: string) => text
        }

        switch (level) {
            case 0: // ERROR
                return chalk.red
            case 1: // WARN
                return chalk.yellow
            case 2: // INFO
                return chalk.blue
            case 3: // SUCCESS
                return chalk.green
            case 4: // DEBUG
                return chalk.gray
            default:
                return (text: string) => text
        }
    }

    private log(level: LogLevelType, params: LogParams): void {
        if (!this.shouldLog(level)) return

        const ctx = getLogContext()
        const isPlainObject = (v: unknown): v is Record<string, unknown> => {
            if (v === null || typeof v !== 'object' || Array.isArray(v))
                return false
            const proto = Object.getPrototypeOf(v)
            return proto === Object.prototype || proto === null
        }
        const effectiveParams: LogParams = ctx
            ? {
                  ...params,
                  correlationId: params.correlationId ?? ctx.correlationId,
                  data: isPlainObject(params.data)
                      ? { ...(ctx as Record<string, unknown>), ...params.data }
                      : (params.data ?? ctx),
              }
            : params

        const formattedMessage = this.formatMessage(effectiveParams)
        const color = this.getColor(level)
        const coloredMessage = color(formattedMessage)

        console.log(coloredMessage)

        if (effectiveParams.data) {
            console.log(color(JSON.stringify(effectiveParams.data, null, 2)))
        }

        if (effectiveParams.error) {
            console.error(color(serializeError(effectiveParams.error)))
        }
    }

    error(params: LogParams): void {
        this.log(0, params)

        const extras: Record<string, unknown> = { message: params.message }
        if (params.data) extras.data = params.data

        if (params.error) {
            captureException(toError(params.error), extras)
        } else {
            captureMessage(params.message, 'error', extras)
        }

        addBreadcrumb('error', params.message, 'error')

        if (recordWithCooldown('error-rate', 60_000, 10, 5 * 60_000)) {
            void emitAlert({
                title: '🚨 Error-rate spike',
                description: '10+ errors in 60 seconds',
                color: 'danger',
            })
        }
    }

    warn(params: LogParams): void {
        this.log(1, params)

        addBreadcrumb('warning', params.message, 'warning')
    }

    info(params: LogParams): void {
        this.log(2, params)

        addBreadcrumb('info', params.message, 'info')
    }

    success(params: LogParams): void {
        this.log(3, params)

        addBreadcrumb('info', params.message, 'info')
    }

    debug(params: LogParams): void {
        this.log(4, params)

        addBreadcrumb('debug', params.message, 'debug')
    }
}
