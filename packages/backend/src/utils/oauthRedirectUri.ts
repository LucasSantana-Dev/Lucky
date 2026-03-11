import type { Request } from 'express'

const getForwardedHeader = (
    req: Request,
    headerName: string,
): string | undefined => {
    const value = req.headers[headerName]
    if (!value) return undefined
    const raw = Array.isArray(value) ? value[0] : value
    return raw.split(',')[0].trim() || undefined
}

const normalizeCallbackPath = (redirectUri?: string): URL | undefined => {
    if (!redirectUri) return undefined

    try {
        const parsed = new URL(redirectUri)
        if (parsed.pathname === '/auth/callback') {
            parsed.pathname = '/api/auth/callback'
        }
        return parsed
    } catch {
        return undefined
    }
}

const getCanonicalBackendRedirectUri = (): string | undefined => {
    const backendUrl = process.env.WEBAPP_BACKEND_URL?.trim()

    if (!backendUrl) {
        return undefined
    }

    try {
        const parsed = new URL(backendUrl)
        parsed.pathname = '/api/auth/callback'
        parsed.search = ''
        parsed.hash = ''
        return parsed.toString()
    } catch {
        return undefined
    }
}

const resolveNormalizedRedirectUri = (
    redirectUri: string | undefined,
    canonicalBackendRedirectUri: string | undefined,
): string | undefined => {
    const parsed = normalizeCallbackPath(redirectUri)

    if (!parsed) {
        return undefined
    }

    if (
        process.env.NODE_ENV === 'production' &&
        canonicalBackendRedirectUri &&
        parsed.pathname === '/api/auth/callback'
    ) {
        return canonicalBackendRedirectUri
    }

    return parsed.toString()
}

const resolveRequestScopedRedirectUri = (
    redirectUri: string | undefined,
    requestRedirectUri: string,
    canonicalBackendRedirectUri: string | undefined,
): string | undefined => {
    if (!redirectUri) {
        return undefined
    }

    if (process.env.NODE_ENV !== 'production' || canonicalBackendRedirectUri) {
        return redirectUri
    }

    try {
        const parsedRedirectUri = new URL(redirectUri)
        const parsedRequestRedirectUri = new URL(requestRedirectUri)
        const isLocalRequestHost =
            parsedRequestRedirectUri.hostname === 'localhost' ||
            parsedRequestRedirectUri.hostname === '127.0.0.1'

        if (isLocalRequestHost) {
            return redirectUri
        }

        if (
            parsedRedirectUri.pathname === '/api/auth/callback' &&
            parsedRedirectUri.origin !== parsedRequestRedirectUri.origin
        ) {
            return requestRedirectUri
        }
    } catch {
        return redirectUri
    }

    return redirectUri
}

const buildRequestRedirectUri = (req: Request): string => {
    const forwardedProto = getForwardedHeader(req, 'x-forwarded-proto')
    const forwardedHost = getForwardedHeader(req, 'x-forwarded-host')
    const protocol =
        process.env.NODE_ENV === 'production'
            ? 'https'
            : (forwardedProto ?? req.protocol ?? 'http')
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
    const canonicalBackendRedirectUri = getCanonicalBackendRedirectUri()
    const requestRedirectUri = buildRequestRedirectUri(req)
    const normalizedSessionRedirectUri = resolveNormalizedRedirectUri(
        sessionRedirectUri,
        canonicalBackendRedirectUri,
    )
    const normalizedEnvRedirectUri = resolveNormalizedRedirectUri(
        process.env.WEBAPP_REDIRECT_URI,
        canonicalBackendRedirectUri,
    )

    return (
        resolveRequestScopedRedirectUri(
            normalizedSessionRedirectUri,
            requestRedirectUri,
            canonicalBackendRedirectUri,
        ) ??
        resolveRequestScopedRedirectUri(
            normalizedEnvRedirectUri,
            requestRedirectUri,
            canonicalBackendRedirectUri,
        ) ??
        canonicalBackendRedirectUri ??
        requestRedirectUri
    )
}
