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

        // Strip unknown fields by reconstructing query with only schema keys
        const dataKeys = new Set(Object.keys(result.data as object))
        for (const key of Object.keys(req.query)) {
            if (!dataKeys.has(key)) {
                delete req.query[key]
            }
        }
        // Assign validated data back (which includes transformations like coercion)
        Object.assign(req.query, result.data as object)
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

        // Strip unknown fields by reconstructing params with only schema keys
        const dataKeys = new Set(Object.keys(result.data as object))
        for (const key of Object.keys(req.params)) {
            if (!dataKeys.has(key)) {
                delete req.params[key]
            }
        }
        // Assign validated data back (which includes transformations like coercion)
        Object.assign(req.params, result.data as object)
        next()
    }
}
