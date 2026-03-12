import type { Express, Request, Response } from 'express'
import { redisClient } from '@lucky/shared/services'
import { getFrontendOrigins } from '../utils/frontendOrigin'
import { getOAuthRedirectUri } from '../utils/oauthRedirectUri'
import { buildAuthConfigHealth } from '../utils/authHealth'

const DEFAULT_PRODUCTION_CLIENT_ID = '962198089161134131'

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
        const frontendOrigins = getFrontendOrigins()
        const backendOrigins = (process.env.WEBAPP_BACKEND_URL ?? '')
            .split(',')
            .map((origin) => origin.trim())
            .filter((origin) => origin.length > 0)
        const clientId = process.env.CLIENT_ID?.trim() ?? ''
        const expectedClientId =
            process.env.WEBAPP_EXPECTED_CLIENT_ID?.trim() ??
            (process.env.NODE_ENV === 'production'
                ? DEFAULT_PRODUCTION_CLIENT_ID
                : '')
        const sessionSecretConfigured = Boolean(
            process.env.WEBAPP_SESSION_SECRET?.trim(),
        )
        const redisHealthy = redisClient.isHealthy()

        const healthResponse = buildAuthConfigHealth({
            clientId,
            redirectUri,
            frontendOrigins,
            backendOrigins,
            sessionSecretConfigured,
            redisHealthy,
            expectedClientId,
        })

        res.json(healthResponse)
    })
}
