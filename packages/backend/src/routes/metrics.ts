import type { Express, Request, Response } from 'express'
import { errorLog } from '@lucky/shared/utils'
import { registry } from '../utils/prometheus'

/**
 * Mount the /metrics endpoint that Prometheus scrapes.
 *
 * Intentionally unauthenticated and outside the /api rate limiter so
 * the scraper can pull at its configured cadence. Restrict access at the
 * network layer (Docker network, ingress allowlist).
 *
 * Set METRICS_DISABLED=true to skip the mount entirely.
 */
export function setupMetricsRoute(app: Express): void {
    if (process.env.METRICS_DISABLED === 'true') return
    app.get('/metrics', (_req: Request, res: Response) => {
        registry
            .metrics()
            .then((body) => {
                res.set('content-type', registry.contentType)
                res.status(200).send(body)
            })
            .catch((error: unknown) => {
                errorLog({
                    message: 'metrics route: failed to render',
                    error,
                })
                res.status(500).send('internal error')
            })
    })
}
