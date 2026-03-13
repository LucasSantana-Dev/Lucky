import type { Express, Request, Response } from 'express'
import { redisClient } from '@lucky/shared/services'
import { getFrontendOrigins } from '../utils/frontendOrigin'
import { getOAuthRedirectUri } from '../utils/oauthRedirectUri'
import { buildAuthConfigHealth } from '../utils/authHealth'

export const getForwardedHeader = (
    req: Request,
    headerName: string,
): string | undefined => {
    const value = req.headers[headerName]
    if (!value) return undefined
    const raw = Array.isArray(value) ? value[0] : value
    return raw.split(',')[0].trim() || undefined
}

export const resolveRequestOrigin = (req: Request): string | undefined => {
    const forwardedProtocol =
        req.get('x-forwarded-proto')?.split(',')[0].trim() ||
        getForwardedHeader(req, 'x-forwarded-proto')
    const forwardedHost =
        req.get('x-forwarded-host')?.split(',')[0].trim() ||
        getForwardedHeader(req, 'x-forwarded-host')
    const protocol = forwardedProtocol ?? req.protocol ?? 'http'
    const host = forwardedHost ?? req.get('host') ?? ''

    if (!host) {
        return undefined
    }

    try {
        return new URL(`${protocol}://${host}`).origin
    } catch {
        return undefined
    }
}

export function setupHealthRoutes(app: Express): void {
    app.get('/api/health', (_req: Request, res: Response) => {
        res.json({
            status: 'ok',
            redis: redisClient.isHealthy(),
            uptime: process.uptime(),
        })
    })

    app.get('/api/health/cache', (_req: Request, res: Response) => {
        const metrics = redisClient.getMetrics()
        res.json({
            redis: redisClient.isHealthy(),
            cache: {
                ...metrics,
                hitRate: `${(metrics.hitRate * 100).toFixed(1)}%`,
            },
        })
    })

    app.get('/api/health/auth-config', (req: Request, res: Response) => {
        const redirectUri = getOAuthRedirectUri(req)
        const requestOrigin = resolveRequestOrigin(req)
        const frontendOrigins = getFrontendOrigins()
        const backendOrigins = (process.env.WEBAPP_BACKEND_URL ?? '')
            .split(',')
            .map((origin) => origin.trim())
            .filter((origin) => origin.length > 0)
        const clientId = process.env.CLIENT_ID?.trim() ?? ''
        const expectedClientId =
            process.env.WEBAPP_EXPECTED_CLIENT_ID?.trim() ?? ''
        const sessionSecretConfigured = Boolean(
            process.env.WEBAPP_SESSION_SECRET?.trim(),
        )
        const redisHealthy = redisClient.isHealthy()

        const healthResponse = buildAuthConfigHealth({
            clientId,
            redirectUri,
            frontendOrigins,
            backendOrigins,
            requestOrigin,
            sessionSecretConfigured,
            redisHealthy,
            expectedClientId,
        })

        res.json(healthResponse)
    })
}
