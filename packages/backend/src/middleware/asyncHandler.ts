import type { Request, Response, NextFunction } from 'express'

type AsyncRouteHandler = (
    req: Request,
    res: Response,
    next: NextFunction,
) => Promise<void> | void

export function asyncHandler(fn: AsyncRouteHandler) {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next)
    }
}
