import type { Express, Request, Response } from 'express'
import { writeLimiter } from '../middleware/rateLimit'
import { asyncHandler } from '../middleware/asyncHandler'
import { AppError } from '../errors/AppError'
import { requireStripeEnabled } from '../utils/billingConfig'

// Route surface only — real handlers land in the next PR. Every handler
// short-circuits via requireStripeEnabled() so production (with
// STRIPE_ENABLED unset) sees 503 here.

export function setupBillingRoutes(app: Express): void {
    app.get(
        '/api/billing/status',
        asyncHandler(async (_req: Request, _res: Response) => {
            requireStripeEnabled()
            throw new AppError(501, 'Not implemented')
        }),
    )

    app.post(
        '/api/billing/checkout',
        writeLimiter,
        asyncHandler(async (_req: Request, _res: Response) => {
            requireStripeEnabled()
            throw new AppError(501, 'Not implemented')
        }),
    )

    app.post(
        '/api/billing/portal',
        writeLimiter,
        asyncHandler(async (_req: Request, _res: Response) => {
            requireStripeEnabled()
            throw new AppError(501, 'Not implemented')
        }),
    )

    app.delete(
        '/api/billing/subscription',
        writeLimiter,
        asyncHandler(async (_req: Request, _res: Response) => {
            requireStripeEnabled()
            throw new AppError(501, 'Not implemented')
        }),
    )
}
