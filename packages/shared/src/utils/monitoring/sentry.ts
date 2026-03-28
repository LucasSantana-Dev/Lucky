import * as Sentry from '@sentry/node'
import { infoLog } from '../general/log'

export interface InitializeSentryOptions {
    appName?: string
    serviceName?: string
    environment?: string
    release?: string
    serverName?: string
    tracesSampleRate?: number
    profilesSampleRate?: number
    tags?: Record<string, string>
}

function isDevelopmentEnvironment(): boolean {
    return (process.env.NODE_ENV ?? 'development') === 'development'
}

export function isSentryEnabled(): boolean {
    if (process.env.SENTRY_ENABLED === 'false') {
        return false
    }

    if (!process.env.SENTRY_DSN) {
        return false
    }

    return !isDevelopmentEnvironment()
}

function getSanitizedExtra(
    extras?: Record<string, unknown>,
): Record<string, unknown> | undefined {
    if (!extras) {
        return undefined
    }

    const sanitizedExtras = { ...extras }

    delete sanitizedExtras.password
    delete sanitizedExtras.token
    delete sanitizedExtras.secret

    return sanitizedExtras
}

function resolveSampleRate(
    explicitValue: number | undefined,
    envValue: string | undefined,
    fallbackValue: number,
): number {
    if (explicitValue !== undefined) {
        return explicitValue
    }

    if (envValue) {
        const parsedValue = Number(envValue)

        if (!Number.isNaN(parsedValue)) {
            return parsedValue
        }
    }

    return fallbackValue
}

/**
 * Capture an exception in Sentry
 * @param error The error to capture
 * @param extras Additional data to include with the exception
 */
export function captureException(
    error: Error,
    extras?: Record<string, unknown>,
): void {
    if (!isSentryEnabled()) {
        return
    }

    Sentry.captureException(error, { extra: getSanitizedExtra(extras) })
}

/**
 * Capture a message in Sentry
 * @param message The message to capture
 * @param level The severity level
 * @param extras Additional data to include with the message
 */
export function captureMessage(
    message: string,
    level: Sentry.SeverityLevel = 'info',
    extras?: Record<string, unknown>,
): void {
    if (!isSentryEnabled()) {
        return
    }

    Sentry.captureMessage(message, {
        level,
        extra: getSanitizedExtra(extras),
    })
}

/**
 * Initialize Sentry monitoring with appropriate configuration
 */
export function initializeSentry(options: InitializeSentryOptions = {}): void {
    if (!process.env.SENTRY_DSN) {
        if (process.env.NODE_ENV === 'production') {
            infoLog({
                message: 'Sentry DSN not configured, skipping initialization',
            })
        }
        return
    }

    if (process.env.SENTRY_ENABLED === 'false') {
        infoLog({
            message: 'Sentry explicitly disabled, skipping initialization',
        })
        return
    }

    if (isDevelopmentEnvironment()) {
        return
    }

    const environment =
        options.environment ??
        process.env.SENTRY_ENVIRONMENT ??
        process.env.NODE_ENV ??
        'development'
    const tracesSampleRate = resolveSampleRate(
        options.tracesSampleRate,
        process.env.SENTRY_TRACES_SAMPLE_RATE,
        environment === 'production' ? 0.1 : 1.0,
    )
    const profilesSampleRate = resolveSampleRate(
        options.profilesSampleRate,
        process.env.SENTRY_PROFILES_SAMPLE_RATE,
        environment === 'production' ? 0.1 : 1.0,
    )
    const appName = options.appName ?? process.env.SENTRY_APP_NAME
    const serviceName = options.serviceName ?? process.env.SENTRY_SERVICE_NAME
    const release = options.release ?? process.env.SENTRY_RELEASE
    const serverName =
        options.serverName ??
        process.env.SENTRY_SERVER_NAME ??
        process.env.HOSTNAME

    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment,
        release,
        serverName,
        tracesSampleRate,
        profilesSampleRate,
        integrations: [],
        initialScope: {
            tags: {
                ...(appName ? { app: appName } : {}),
                ...(serviceName ? { service: serviceName } : {}),
                ...options.tags,
            },
        },
        beforeSend(event) {
            event.extra = getSanitizedExtra(event.extra)
            return event
        },
    })

    infoLog({
        message: 'Sentry monitoring initialized',
        data: {
            environment,
            release,
            serverName,
            appName,
            serviceName,
        },
    })
}

export async function flushSentry(timeout = 2000): Promise<boolean> {
    if (!isSentryEnabled()) {
        return false
    }

    return Sentry.flush(timeout)
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(
    message: string,
    category?: string,
    level?: 'debug' | 'info' | 'warning' | 'error' | 'fatal',
    data?: Record<string, unknown>,
): void {
    if (!isSentryEnabled()) {
        return
    }

    Sentry.addBreadcrumb({
        message,
        category: category ?? 'general',
        level: level ?? 'info',
        data,
    })
}

/**
 * Monitor command execution
 */
export function monitorCommandExecution(
    commandName: string,
    userId: string,
    guildId?: string,
): void {
    addBreadcrumb(`Command executed: ${commandName}`, 'command', 'info')

    if (isSentryEnabled()) {
        Sentry.setContext('command', {
            name: commandName,
            userId,
            guildId,
        })
    }
}

/**
 * Monitor interaction handling
 */
export function monitorInteractionHandling(
    interactionType: string,
    userId: string,
    guildId?: string,
): void {
    addBreadcrumb(
        `Interaction handled: ${interactionType}`,
        'interaction',
        'info',
    )

    if (isSentryEnabled()) {
        Sentry.setContext('interaction', {
            type: interactionType,
            userId,
            guildId,
        })
    }
}
