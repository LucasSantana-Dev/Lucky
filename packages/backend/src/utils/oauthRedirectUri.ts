import type { Request } from 'express'

const CANONICAL_PRODUCTION_REDIRECT_URI =
    'https://lucky-api.lucassantana.tech/api/auth/callback'

const getForwardedHeader = (
    req: Request,
    headerName: string,
): string | undefined => {
    const value = req.headers[headerName]
    if (!value) return undefined
    const raw = Array.isArray(value) ? value[0] : value
    return raw.split(',')[0].trim() || undefined
}

const normalizeCallbackPath = (redirectUri?: string): string | undefined => {
    if (!redirectUri) return undefined

    try {
        const parsed = new URL(redirectUri)
        if (parsed.pathname === '/auth/callback') {
            parsed.pathname = '/api/auth/callback'
        }
        return parsed.toString()
    } catch {
        return undefined
    }
}

const isLegacyProductionFrontendRedirect = (redirectUri: string): boolean => {
    try {
        const parsed = new URL(redirectUri)
        return (
            parsed.hostname === 'lucky.lucassantana.tech' &&
            (parsed.pathname === '/api/auth/callback' ||
                parsed.pathname === '/auth/callback')
        )
    } catch {
        return false
    }
}

const getCanonicalProductionRedirectUri = (): string => {
    const backendUrl = process.env.WEBAPP_BACKEND_URL
    if (!backendUrl) {
        return CANONICAL_PRODUCTION_REDIRECT_URI
    }

    try {
        return new URL('/api/auth/callback', backendUrl).toString()
    } catch {
        return CANONICAL_PRODUCTION_REDIRECT_URI
    }
}

const buildRequestRedirectUri = (req: Request): string => {
    const forwardedProto = getForwardedHeader(req, 'x-forwarded-proto')
    const forwardedHost = getForwardedHeader(req, 'x-forwarded-host')
    const protocol = forwardedProto ?? req.protocol ?? 'http'
    const host =
        forwardedHost ??
        req.get('host') ??
        `localhost:${process.env.WEBAPP_PORT ?? '3000'}`

    return `${protocol}://${host}/api/auth/callback`
}

export function getOAuthRedirectUri(
    req: Request,
    sessionRedirectUri?: string,
): string {
    const resolvedRedirectUri =
        normalizeCallbackPath(sessionRedirectUri) ??
        normalizeCallbackPath(process.env.WEBAPP_REDIRECT_URI) ??
        (process.env.NODE_ENV === 'production'
            ? getCanonicalProductionRedirectUri()
            : buildRequestRedirectUri(req))

    if (
        process.env.NODE_ENV === 'production' &&
        isLegacyProductionFrontendRedirect(resolvedRedirectUri)
    ) {
        return getCanonicalProductionRedirectUri()
    }

    return resolvedRedirectUri
}
