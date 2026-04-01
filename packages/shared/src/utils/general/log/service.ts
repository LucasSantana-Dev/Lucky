/* eslint-disable no-console */
import chalk from 'chalk'
import {
    addBreadcrumb,
    captureException,
    captureMessage,
} from '../../monitoring'
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

        const formattedMessage = this.formatMessage(params)
        const color = this.getColor(level)
        const coloredMessage = color(formattedMessage)

        console.log(coloredMessage)

        if (params.data) {
            console.log(color(JSON.stringify(params.data, null, 2)))
        }

        if (params.error) {
            console.error(color(serializeError(params.error)))
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
