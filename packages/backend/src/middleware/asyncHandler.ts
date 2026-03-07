import type { Request, Response, NextFunction } from 'express'

type AsyncRouteHandler = (
    req: Request,
    res: Response,
    next: NextFunction,
) => Promise<void> | void

export function asyncHandler(fn: AsyncRouteHandler) {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            const result = fn(req, res, next)
            if (result instanceof Promise) {
                result.catch(next)
            }
        } catch (err) {
            next(err)
        }
    }
}
