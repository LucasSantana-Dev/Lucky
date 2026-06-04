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
    const supportUrl = process.env.SUPPORT_URL ?? undefined

    if (!supportUrl) {
        // Graceful absent state: support URL is optional
        return {
            supportLink: null,
            footerText:
                'An error occurred. Please try again or contact support.',
        }
    }

    // Build query params: cid (correlation ID) + optional context fields
    const params = new URLSearchParams()
    params.set('cid', correlationId)

    if (context?.guildId) {
        params.set('guildId', context.guildId)
    }
    if (context?.command) {
        params.set('command', context.command)
    }
    if (context?.errorCategory) {
        params.set('category', context.errorCategory)
    }

    const supportLink = `${supportUrl}?${params.toString()}`
    const footerText = `Error ID: ${correlationId} — [Report this error](${supportLink})`

    return {
        supportLink,
        footerText,
    }
}
