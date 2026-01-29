import { debugLog, errorLog } from '@lukbot/shared/utils'
import { ServiceFactory } from '../../../../../../src/services/ServiceFactory'

export const autoplayCounters = new Map<string, number>()

/**
 * Get the current autoplay count for a guild
 * Uses Redis service with in-memory fallback
 */
export async function getAutoplayCount(guildId: string): Promise<number> {
    try {
        // Try Redis first
        const guildSettingsService = ServiceFactory.getGuildSettingsService()
        const redisCount = await guildSettingsService.getAutoplayCounter(guildId)
        if (redisCount) {
            return redisCount.count
        }

        // Fallback to in-memory counter
        return autoplayCounters.get(guildId) ?? 0
    } catch (error) {
        errorLog({ message: 'Error getting autoplay count:', error })
        return autoplayCounters.get(guildId) ?? 0
    }
}

/**
 * Increment autoplay count for a guild
 * Updates both Redis and in-memory counter
 */
export async function incrementAutoplayCount(
    guildId: string,
    increment: number = 1,
): Promise<number> {
    try {
        // Update Redis
        const guildSettingsService = ServiceFactory.getGuildSettingsService()
        await guildSettingsService.incrementAutoplayCounter(guildId)

        // Update in-memory counter
        const currentCount = autoplayCounters.get(guildId) ?? 0
        const newCount = currentCount + increment
        autoplayCounters.set(guildId, newCount)

        debugLog({
            message: `Incremented autoplay count for guild ${guildId}`,
            data: { newCount },
        })

        return newCount
    } catch (error) {
        errorLog({ message: 'Error incrementing autoplay count:', error })
        return autoplayCounters.get(guildId) ?? 0
    }
}

/**
 * Reset autoplay count for a guild
 */
export async function resetAutoplayCount(guildId: string): Promise<void> {
    try {
        // Reset Redis counter
        const guildSettingsService = ServiceFactory.getGuildSettingsService()
        await guildSettingsService.resetAutoplayCounter(guildId)

        // Reset in-memory counter
        autoplayCounters.set(guildId, 0)

        debugLog({
            message: `Reset autoplay count for guild ${guildId}`,
        })
    } catch (error) {
        errorLog({ message: 'Error resetting autoplay count:', error })
    }
}

/**
 * Clear all autoplay counters
 */
export async function clearAllAutoplayCounters(): Promise<void> {
    try {
        // Clear in-memory counters
        autoplayCounters.clear()

        // Clear Redis counters
        const guildSettingsService = ServiceFactory.getGuildSettingsService()
        await guildSettingsService.clearAllAutoplayCounters()

        debugLog({ message: 'Cleared all autoplay counters' })
    } catch (error) {
        errorLog({ message: 'Error clearing autoplay counters:', error })
    }
}
