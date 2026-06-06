import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'

// Zod 4 dropped the second `Def` type parameter; the equivalent surface is
// `z.ZodType<TOutput, unknown>`. Keeping the function-level TOutput generic
// preserves caller-side inference exactly.
type Schema<TOutput> = z.ZodType<TOutput, unknown>

function stripUnknownFields(data: object, allowedKeys: Set<string>): void {
    for (const key of Object.keys(data)) {
        if (!allowedKeys.has(key)) {
            delete (data as Record<string, unknown>)[key]
        }
    }
}

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

        // Strip unknown fields and assign validated data back (which includes transformations like coercion)
        stripUnknownFields(
            req.query,
            new Set(Object.keys(result.data as object)),
        )
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

        // Strip unknown fields and assign validated data back (which includes transformations like coercion)
        stripUnknownFields(
            req.params,
            new Set(Object.keys(result.data as object)),
        )
        Object.assign(req.params, result.data as object)
        next()
    }
}
