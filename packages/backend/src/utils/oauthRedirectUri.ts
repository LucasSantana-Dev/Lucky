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
    return (
        sessionRedirectUri ??
        process.env.WEBAPP_REDIRECT_URI ??
        buildRequestRedirectUri(req)
    )
}
