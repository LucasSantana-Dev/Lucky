/* eslint-disable no-console */
import * as Sentry from '@sentry/node'
// import { nodeProfilingIntegration } from '@sentry/profiling-node'

/**
 * Capture an exception in Sentry
 * @param error The error to capture
 * @param extras Additional data to include with the exception
 */
export function captureException(
    error: Error,
    extras?: Record<string, unknown>,
): void {
    if (!process.env.SENTRY_DSN || process.env.NODE_ENV === 'development') {
        return
    }

    Sentry.captureException(error, { extra: extras })
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
    if (!process.env.SENTRY_DSN || process.env.NODE_ENV === 'development') {
        return
    }

    Sentry.captureMessage(message, {
        level,
        extra: extras,
    })
}

/**
 * Initialize Sentry monitoring with appropriate configuration
 */
export function initializeSentry(): void {
    if (!process.env.SENTRY_DSN) {
        console.log('Sentry DSN not configured, skipping initialization')
        return
    }

    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV ?? 'development',
        tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
        profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
        integrations: [],
        beforeSend(event) {
            // Filter out sensitive data
            if (event.extra) {
                delete event.extra.password
                delete event.extra.token
                delete event.extra.secret
            }
            return event
        },
    })

    console.log('Sentry monitoring initialized')
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
    if (!process.env.SENTRY_DSN || process.env.NODE_ENV === 'development') {
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

    if (process.env.SENTRY_DSN && process.env.NODE_ENV !== 'development') {
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

    if (process.env.SENTRY_DSN && process.env.NODE_ENV !== 'development') {
        Sentry.setContext('interaction', {
            type: interactionType,
            userId,
            guildId,
        })
    }
}
