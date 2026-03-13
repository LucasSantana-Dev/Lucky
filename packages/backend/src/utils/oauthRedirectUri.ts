import type { Request } from 'express'
import { getFrontendOrigins } from './frontendOrigin'

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

const resolveBackendCallbackUri = (): string | undefined => {
    const backendUrl = process.env.WEBAPP_BACKEND_URL?.trim()
    if (!backendUrl) return undefined

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

const isPublicOrigin = (origin: string): boolean => {
    return (
        !origin.includes('localhost') &&
        !origin.includes('127.0.0.1') &&
        !origin.includes('0.0.0.0')
    )
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

const resolveEnvRedirectUri = (req: Request): string | undefined => {
    const normalized = normalizeCallbackPath(process.env.WEBAPP_REDIRECT_URI)
    if (!normalized) return undefined

    if (process.env.NODE_ENV !== 'production') {
        return normalized
    }

    const backendCallback = resolveBackendCallbackUri()
    if (backendCallback) {
        return backendCallback
    }

    try {
        const parsedRedirect = new URL(normalized)
        const frontendOrigins = new Set(
            getFrontendOrigins().map((origin) => {
                try {
                    return new URL(origin).origin
                } catch {
                    return ''
                }
            }),
        )

        const requestCallback = buildRequestRedirectUri(req)
        const requestOrigin = new URL(requestCallback).origin

        if (
            frontendOrigins.has(parsedRedirect.origin) &&
            isPublicOrigin(requestOrigin)
        ) {
            return requestCallback
        }
    } catch {
        return undefined
    }

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

    if (process.env.NODE_ENV === 'production') {
        const backendCallback = resolveBackendCallbackUri()
        if (backendCallback) {
            return backendCallback
        }
    }

    return (
        resolveEnvRedirectUri(req) ??
        normalizeCallbackPath(process.env.WEBAPP_REDIRECT_URI) ??
        buildRequestRedirectUri(req)
    )
}
