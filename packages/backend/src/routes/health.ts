import type { Express, Request, Response } from 'express'
import { redisClient } from '@lucky/shared/services'
import { getFrontendOrigins } from '../utils/frontendOrigin'
import { getOAuthRedirectUri } from '../utils/oauthRedirectUri'

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
        const clientIdConfigured = Boolean(process.env.CLIENT_ID?.trim())
        const sessionSecretConfigured = Boolean(
            process.env.WEBAPP_SESSION_SECRET?.trim(),
        )
        const redisHealthy = redisClient.isHealthy()

        const warnings: string[] = []

        if (!clientIdConfigured) {
            warnings.push('CLIENT_ID not configured')
        }

        if (!sessionSecretConfigured) {
            warnings.push('WEBAPP_SESSION_SECRET not configured')
        }

        if (!redisHealthy) {
            warnings.push('Redis is not healthy for shared services')
        }

        try {
            const parsedRedirectUri = new URL(redirectUri)
            if (parsedRedirectUri.pathname !== '/api/auth/callback') {
                warnings.push(
                    'OAuth callback path should be /api/auth/callback',
                )
            }
        } catch {
            warnings.push('OAuth redirect URI is invalid')
        }

        if (frontendOrigins.length === 0) {
            warnings.push('No WEBAPP_FRONTEND_URL origins configured')
        }

        res.json({
            status: warnings.length === 0 ? 'ok' : 'degraded',
            auth: {
                redirectUri,
                frontendOrigins,
                clientIdConfigured,
                sessionSecretConfigured,
                redisHealthy,
            },
            warnings,
        })
    })
}
