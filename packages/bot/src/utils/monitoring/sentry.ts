import * as Sentry from '@sentry/node'
import { telemetryLog } from '@lucky/shared/utils'

/**
 * Extract the safe origin (protocol + hostname) from a URL string.
 * Returns the origin if the URL is valid, otherwise returns a placeholder.
 * Used to redact signed/private URLs before sending to Sentry.
 */
export function safeUrlOrigin(url: unknown): string {
    if (typeof url !== 'string') return 'invalid-url'
    try {
        const parsed = new URL(url)
        return parsed.origin
    } catch {
        return 'invalid-url'
    }
}

/**
 * Replace every URL-like substring in free text with just its origin, dropping
 * the path/query where signed tokens live. Use on error messages (e.g. yt-dlp
 * output) before they reach Sentry — {@link safeUrlOrigin} only redacts an
 * explicit URL field, not URLs embedded in an Error.message.
 */
export function scrubUrls(text: string): string {
    return text.replace(/https?:\/\/[^\s"'<>]+/gi, (match) =>
        safeUrlOrigin(match),
    )
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
 * @param tags Searchable string tags for aggregation and filtering
 */
export function captureMessage(
    message: string,
    level: Sentry.SeverityLevel = 'info',
    extras?: Record<string, unknown>,
    tags?: Record<string, string>,
): void {
    if (!process.env.SENTRY_DSN || process.env.NODE_ENV === 'development') {
        return
    }

    Sentry.captureMessage(message, {
        level,
        extra: extras,
        tags,
    })
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

    // Activation telemetry (#2471): no userId, no command arguments — read in
    // aggregate (Grafana) as "commands per guild", never per user.
    telemetryLog('command_executed', {
        guildId: guildId ?? 'dm',
        command: commandName,
    })

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
