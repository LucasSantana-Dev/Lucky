import type { Request, Response, NextFunction } from 'express'
import { errorLog, captureException } from '@lucky/shared/utils'
import { AppError } from '../errors/AppError'
import { ValidationError } from '@lucky/shared/errors'

export function errorHandler(
    err: Error,
    req: Request,
    res: Response,
    _next: NextFunction,
): void {
    if (err instanceof AppError) {
        const body: Record<string, unknown> = { error: err.message }
        if (err.details) {
            body.details = err.details
        }
        res.status(err.statusCode).json(body)
        return
    }

    if (err instanceof ValidationError) {
        const body: Record<string, unknown> = { error: err.message }
        if (err.details) {
            body.details = err.details
        }
        res.status(400).json(body)
        return
    }

    // Strip the query string: it can carry secrets (OAuth code/state, tokens)
    // that must not leak into logs or Sentry telemetry.
    const path = req.originalUrl.split('?')[0]

    errorLog({
        message: `Unhandled error on ${req.method} ${path}:`,
        error: err,
    })
    captureException(err, {
        context: 'backend-unhandled-route-error',
        method: req.method,
        url: path,
    })
    res.status(500).json({ error: 'Internal server error' })
}
