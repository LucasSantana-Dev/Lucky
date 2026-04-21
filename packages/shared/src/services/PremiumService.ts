import type { GuildSubscriptionModel as GuildSubscription } from '../generated/prisma/models/GuildSubscription'
import { getPrismaClient } from '../utils/database/prismaClient'
import { errorLog } from '../utils/general/log'

// Statuses Stripe reports that indicate a live subscription. canceled,
// past_due, incomplete, and incomplete_expired all fail the gate.
const ACTIVE_STATUSES: ReadonlySet<string> = new Set(['active', 'trialing'])

export class PremiumService {
    /**
     * Returns true when the guild has an active Stripe subscription.
     * - Trusts Stripe's status field (not currentPeriodEnd — clock skew resistant)
     * - currentPeriodEnd is a safety net: if status is active but the period
     *   end is in the past, treat as expired (protects against webhook drops)
     */
    async isPremium(guildId: string): Promise<boolean> {
        const sub = await this.getSubscription(guildId)
        if (!sub) return false
        if (!ACTIVE_STATUSES.has(sub.status)) return false
        if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() <= Date.now()) {
            return false
        }
        return true
    }

    async getSubscription(guildId: string): Promise<GuildSubscription | null> {
        try {
            const prisma = getPrismaClient()
            return await prisma.guildSubscription.findUnique({
                where: { guildId },
            })
        } catch (error) {
            errorLog({
                message: 'PremiumService.getSubscription failed',
                data: { guildId },
                error: error as Error,
            })
            return null
        }
    }
}

export const premiumService = new PremiumService()
