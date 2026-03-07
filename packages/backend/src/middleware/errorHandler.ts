import type { Request, Response, NextFunction } from 'express'
import { errorLog } from '@nexus/shared/utils'
import { AppError } from '../errors/AppError'

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

    errorLog({
        message: `Unhandled error on ${req.method} ${req.originalUrl}:`,
        error: err,
    })
    res.status(500).json({ error: 'Internal server error' })
}
