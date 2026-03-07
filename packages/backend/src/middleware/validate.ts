import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'

export function validateBody<T extends z.ZodTypeAny>(schema: T) {
    return (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req.body)
        if (!result.success) {
            const errors = result.error.errors.map((e) => ({
                field: e.path.join('.'),
                message: e.message,
            }))
            return res.status(400).json({ error: 'Validation failed', errors })
        }
        req.body = result.data
        next()
    }
}

export function validateQuery<T extends z.ZodTypeAny>(schema: T) {
    return (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req.query)
        if (!result.success) {
            const errors = result.error.errors.map((e) => ({
                field: e.path.join('.'),
                message: e.message,
            }))
            return res.status(400).json({ error: 'Validation failed', errors })
        }
        next()
    }
}

export function validateParams<T extends z.ZodTypeAny>(schema: T) {
    return (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req.params)
        if (!result.success) {
            const errors = result.error.errors.map((e) => ({
                field: e.path.join('.'),
                message: e.message,
            }))
            return res.status(400).json({ error: 'Validation failed', errors })
        }
        req.params = result.data
        next()
    }
}
