import { getSupportUrl } from '../../config/config'

/**
 * Result of building error support context.
 */
export interface ErrorSupportContextResult {
    supportLink: string | null // null if SUPPORT_URL is not configured
    footerText: string
}

/**
 * Builds a support link + footer text for display in error surfaces.
 * The support link includes the correlation ID and optional context as query params.
 *
 * If SUPPORT_URL is not configured (graceful), returns supportLink: null and a
 * fallback footer. This ensures error surfaces don't break when support infrastructure
 * is optional in certain deployments.
 *
 * @param correlationId Short, URL-safe correlation ID (required)
 * @param context Optional object with light context fields (guildId, command, category)
 * @returns Object with supportLink (or null) and footerText
 */
export function buildErrorSupportContext(
    correlationId: string,
    context?: {
        guildId?: string
        command?: string
        errorCategory?: string
    },
): ErrorSupportContextResult {
    const supportUrl = getSupportUrl()

    const gracefulAbsent: ErrorSupportContextResult = {
        supportLink: null,
        footerText: 'An error occurred. Please try again or contact support.',
    }

    if (!supportUrl) {
        // Graceful absent state: support URL is optional
        return gracefulAbsent
    }

    // Use the URL API so query params already present on SUPPORT_URL are
    // preserved rather than clobbered by a naive `?` concatenation.
    let url: URL
    try {
        url = new URL(supportUrl)
    } catch {
        // Malformed SUPPORT_URL: degrade gracefully rather than emit a bad link.
        return gracefulAbsent
    }

    url.searchParams.set('cid', correlationId)
    if (context?.guildId) {
        url.searchParams.set('guildId', context.guildId)
    }
    if (context?.command) {
        url.searchParams.set('command', context.command)
    }
    if (context?.errorCategory) {
        url.searchParams.set('category', context.errorCategory)
    }

    const supportLink = url.toString()
    const footerText = `Error ID: ${correlationId} — [Report this error](${supportLink})`

    return {
        supportLink,
        footerText,
    }
}
