import { AppError } from '../errors/AppError'

export function isStripeEnabled(): boolean {
    return (process.env.STRIPE_ENABLED ?? '').toLowerCase() === 'true'
}

export function getStripeConfig(): {
    secretKey: string | undefined
    publishableKey: string | undefined
    priceId: string | undefined
    webhookSecret: string | undefined
} {
    return {
        secretKey: process.env.STRIPE_SECRET_KEY,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
        priceId: process.env.STRIPE_PRICE_ID,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    }
}

export function requireStripeEnabled(): void {
    if (!isStripeEnabled()) {
        throw AppError.serviceUnavailable('Billing disabled')
    }
}
