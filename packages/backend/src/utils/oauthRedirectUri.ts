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

const resolveEnvRedirectUri = (): string | undefined => {
    const normalized = normalizeCallbackPath(process.env.WEBAPP_REDIRECT_URI)
    if (!normalized) return undefined

    return normalized
}

export function getOAuthRedirectUri(
    req: Request,
    sessionRedirectUri?: string,
): string {
    const normalizedSessionRedirectUri =
        normalizeCallbackPath(sessionRedirectUri)

    if (normalizedSessionRedirectUri) {
        return normalizedSessionRedirectUri
    }

    return (
        resolveEnvRedirectUri() ??
        normalizeCallbackPath(process.env.WEBAPP_REDIRECT_URI) ??
        buildRequestRedirectUri(req)
    )
}
