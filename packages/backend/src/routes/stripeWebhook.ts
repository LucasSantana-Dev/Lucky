// When STRIPE_ENABLED=true lands, replace the global json parser for this
// path with express.raw({ type: 'application/json' }) applied BEFORE the
// setupMiddleware json step. Stripe's signature verification needs the
// exact byte-for-byte request body; the global express.json() parser
// mutates req.body into an object and the raw bytes are gone.

import type { Express, Request, Response } from 'express'
import { asyncHandler } from '../middleware/asyncHandler'
import { AppError } from '../errors/AppError'
import { isStripeEnabled } from '../utils/billingConfig'

export function setupStripeWebhookRoutes(app: Express): void {
    app.post(
        '/webhooks/stripe',
        asyncHandler(async (_req: Request, _res: Response) => {
            if (!isStripeEnabled()) {
                throw AppError.serviceUnavailable('Billing disabled')
            }
            throw new AppError(501, 'Not implemented')
        }),
    )
}
