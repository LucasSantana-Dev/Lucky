import type { Express, Request, Response } from 'express'
import { redisClient } from '@lucky/shared/services'
import { getFrontendOrigins } from '../utils/frontendOrigin'
import { getOAuthRedirectUri } from '../utils/oauthRedirectUri'
import { buildAuthConfigHealth } from '../utils/authHealth'

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
        const clientId = process.env.CLIENT_ID?.trim() ?? ''
        const sessionSecretConfigured = Boolean(
            process.env.WEBAPP_SESSION_SECRET?.trim(),
        )
        const redisHealthy = redisClient.isHealthy()

        const healthResponse = buildAuthConfigHealth({
            clientId,
            redirectUri,
            frontendOrigins,
            sessionSecretConfigured,
            redisHealthy,
        })

        res.json(healthResponse)
    })
}
