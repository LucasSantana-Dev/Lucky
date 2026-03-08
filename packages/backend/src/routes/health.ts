import type { Express, Request, Response } from 'express'
import { redisClient } from '@nexus/shared/services'

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
}
