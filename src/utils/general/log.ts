/* eslint-disable no-console */
import chalk from "chalk"
import { addBreadcrumb, captureException, captureMessage } from "../monitoring"

export enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    SUCCESS = 3,
    DEBUG = 4,
}

let currentLogLevel = LogLevel.DEBUG

interface LogParams {
    message: string
    error?: unknown
    level?: LogLevel
    data?: unknown
    correlationId?: string
}

export const setLogLevel = (level: LogLevel): void => {
    currentLogLevel = level
}

const shouldLog = (level: LogLevel): boolean => {
    return level <= currentLogLevel
}

const getErrorMessage = (error: unknown): string => {
    if (!error) return ""
    if (error instanceof Error) return error.message
    if (typeof error === "object" && "message" in error)
        return (error as { message: string }).message
    return JSON.stringify(error)
}

const serializeData = (data: unknown): string => {
    if (!data) return ""
    if (typeof data === "string") return data
    if (typeof data === "object") {
        try {
            return JSON.stringify(data, null, 2)
        } catch {
            return "[Object - unable to serialize]"
        }
    }
    return String(data)
}

export const errorLog = ({
    message,
    error,
    level = LogLevel.ERROR,
    data,
}: LogParams): void => {
    if (!shouldLog(level)) return

    console.error(chalk.red(`${message} ${getErrorMessage(error)}\n`))
    if (data) {
        console.error(chalk.red(serializeData(data)))
    }

    if (!process.env.SENTRY_DSN || process.env.NODE_ENV === "development")
        return

    if (error instanceof Error) {
        return captureException(error, {
            message,
            data: data ? { ...data } : undefined,
        })
    }

    captureMessage(message, "error", {
        error: getErrorMessage(error) || error,
        data: data ? { ...data } : undefined,
    })
}

export const infoLog = ({
    message,
    level = LogLevel.INFO,
    data,
}: LogParams): void => {
    if (!shouldLog(level)) return

    console.info(chalk.blue(`${message}\n`))
    if (data) {
        console.info(chalk.blue(serializeData(data)))
    }

    if (process.env.SENTRY_DSN && process.env.NODE_ENV !== "development") {
        addBreadcrumb("info", message, "info", data ? { ...data } : undefined)
    }
}

export const successLog = ({
    message,
    level = LogLevel.SUCCESS,
    data,
}: LogParams): void => {
    if (!shouldLog(level)) return

    console.log(chalk.green(`${message}\n`))
    if (data) {
        console.log(chalk.green(serializeData(data)))
    }

    if (process.env.SENTRY_DSN && process.env.NODE_ENV !== "development") {
        addBreadcrumb(
            "success",
            message,
            "info",
            data ? { ...data } : undefined,
        )
    }
}

export const warnLog = ({
    message,
    level = LogLevel.WARN,
    data,
}: LogParams): void => {
    if (!shouldLog(level)) return

    console.warn(chalk.yellow(`${message}\n`))
    if (data) {
        console.warn(chalk.yellow(serializeData(data)))
    }

    if (process.env.SENTRY_DSN && process.env.NODE_ENV !== "development") {
        addBreadcrumb(
            "warning",
            message,
            "warning",
            data ? { ...data } : undefined,
        )
    }
}

export const debugLog = ({
    message,
    level = LogLevel.DEBUG,
    data,
}: LogParams): void => {
    if (!shouldLog(level)) return

    console.debug(chalk.gray(`${message}\n`))
    if (data) {
        console.debug(chalk.gray(serializeData(data)))
    }

    if (process.env.SENTRY_DSN && process.env.NODE_ENV !== "development") {
        addBreadcrumb("debug", message, "debug", data ? { ...data } : undefined)
    }
}
