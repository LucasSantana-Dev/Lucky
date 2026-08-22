import chalk from 'chalk'
import {
    addBreadcrumb,
    captureException,
    captureMessage,
} from '../../monitoring'
import { recordWithCooldown, emitAlert } from '../../alerts'
import { getLogContext } from './context'
import { LEVEL_TOKEN } from './types'
import type { LogLevelType, LogParams, LogConfig } from './types'

function sanitizeForLogging(text: string): string {
    return text.replace(/[\x00-\x1f\x7f]/g, ' ')
}

function serializeError(err: unknown): string {
    if (err instanceof Error) {
        const sanitizedName = sanitizeForLogging(err.name)
        const sanitizedMessage = sanitizeForLogging(err.message)
        const sanitizedStack = sanitizeForLogging(err.stack ?? '')
        return `${sanitizedName}: ${sanitizedMessage}\n${sanitizedStack}`
    }
    try {
        return JSON.stringify(err, null, 2)
    } catch {
        return String(err)
    }
}

/**
 * Prefixes EVERY physical line, not just the first.
 *
 * serializeError emits `name: message\n<stack>` and serializeData uses
 * JSON.stringify(..., 2), so both are routinely multi-line. Prefixing only the
 * first line leaves every stack frame and every JSON continuation without the
 * level token, which is exactly what an anchored per-line shipper parser drops.
 * That would defeat the point of writing the level as a parseable token.
 */
function prefixLines(
    token: string,
    value: string,
    color: (s: string) => string,
): string {
    const lines = value.split('\n')
    // serializeError ends with the stack, which is empty when an Error carries
    // none — that leaves a trailing '' segment that would emit a bare
    // "[ERROR] " line with nothing after it.
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
    // Order matters: sanitise the RAW line, then colour it. Colouring first and
    // sanitising after would strip the ANSI escapes, since \x1b is a control
    // character. Sanitising here rather than at each caller keeps it a single
    // choke point no caller can forget, and keeps the taint path visible.
    return lines
        .map((line) => token + color(sanitizeForLogging(line)))
        .join('\n')
}

function serializeData(data: unknown): string {
    try {
        return JSON.stringify(data, null, 2)
    } catch {
        return String(data)
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

        // Prepended last so the level is always at index 0, whatever the
        // timestamp/correlationId flags are set to. A shipper can then anchor
        // on `^\[LEVEL\]` instead of scanning the line for a keyword, which
        // is what let message *content* forge a level (#2054).

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
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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

        // The token sits OUTSIDE the colour wrapper. chalk wraps whatever it
        // is given in ANSI escapes, so a token inside it would make the line
        // start with \x1b[33m rather than [WARN] and defeat an anchored
        // shipper regex entirely. An out-of-range level is a programming
        // error, not a severity, so it falls back to INFO rather than
        // emitting `[undefined]`.
        const token = `[${LEVEL_TOKEN[level] ?? 'INFO'}] `

        // Strip control characters (CR/LF/etc.) so user-provided values in the
        // message can't forge additional log lines (log injection).

        console.log(prefixLines(token, formattedMessage, color))

        if (effectiveParams.data) {
            console.log(
                prefixLines(token, serializeData(effectiveParams.data), color),
            )
        }

        if (effectiveParams.error) {
            console.error(
                prefixLines(
                    token,
                    serializeError(effectiveParams.error),
                    color,
                ),
            )
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
