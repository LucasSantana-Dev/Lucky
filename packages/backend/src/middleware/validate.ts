import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'

type Schema<TOutput> = z.ZodType<TOutput, z.ZodTypeDef, unknown>

export function validateBody<TOutput>(schema: Schema<TOutput>) {
    return (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req.body as unknown)
        if (!result.success) {
            const errors = result.error.issues.map((e) => ({
                field: e.path.join('.'),
                message: e.message,
            }))
            return res.status(400).json({ error: 'Validation failed', errors })
        }

        req.body = result.data
        next()
    }
}

export function validateQuery<TOutput>(schema: Schema<TOutput>) {
    return (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req.query as unknown)
        if (!result.success) {
            const errors = result.error.issues.map((e) => ({
                field: e.path.join('.'),
                message: e.message,
            }))
            return res.status(400).json({ error: 'Validation failed', errors })
        }

        Object.keys(req.query).forEach((key) => {
            if (!(key in (result.data as any))) {
                delete req.query[key]
            }
        })
        Object.assign(req.query, result.data as any)
        next()
    }
}

export function validateParams<TOutput>(schema: Schema<TOutput>) {
    return (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req.params as unknown)
        if (!result.success) {
            const errors = result.error.issues.map((e) => ({
                field: e.path.join('.'),
                message: e.message,
            }))
            return res.status(400).json({ error: 'Validation failed', errors })
        }

        Object.keys(req.params).forEach((key) => {
            if (!(key in (result.data as any))) {
                delete req.params[key]
            }
        })
        Object.assign(req.params, result.data as any)
        next()
    }
}
