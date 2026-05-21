import type { Request, Response, NextFunction } from 'express'
import {
    httpRequestsTotal,
    httpRequestDurationSeconds,
    httpServerErrorsTotal,
} from '../utils/prometheus'

/**
 * Express middleware that records request count and duration to the
 * Prometheus registry. Uses Express's resolved `req.route.path` template
 * (e.g. `/api/guilds/:guildId`) as the label so cardinality stays bounded;
 * if no route is matched (404, static files), the literal string `unmatched`
 * is used instead of the raw URL.
 */
export function metricsMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    const start = process.hrtime.bigint()

    res.on('finish', () => {
        const elapsedSeconds =
            Number(process.hrtime.bigint() - start) / 1_000_000_000
        const method = req.method
        const route = resolveRoute(req)
        const status = String(res.statusCode)
        httpRequestsTotal.inc({ method, route, status })
        httpRequestDurationSeconds.observe(
            { method, route, status },
            elapsedSeconds,
        )
        if (res.statusCode >= 500) {
            httpServerErrorsTotal.inc({ method, route })
        }
    })

    next()
}

function resolveRoute(req: Request): string {
    const route = req.route as { path?: string } | undefined
    if (route?.path && typeof route.path === 'string') {
        return route.path
    }
    // baseUrl is set when middleware is mounted under a prefix (e.g. /api).
    if (req.baseUrl) return `${req.baseUrl}/unmatched`
    return 'unmatched'
}
