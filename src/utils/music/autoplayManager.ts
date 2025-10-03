/**
 * Autoplay manager for tracking autoplay usage across guilds
 * Uses Redis service with in-memory fallback
 */

import { guildSettingsService } from "../../services/GuildSettingsService"
import { debugLog, errorLog } from "../general/log"

// Legacy in-memory map for backward compatibility
export const autoplayCounters = new Map<string, number>()

/**
 * Get the current autoplay count for a guild
 * Uses Redis service with in-memory fallback
 */
export async function getAutoplayCount(guildId: string): Promise<number> {
    try {
        // Try Redis first
        const redisCount =
            await guildSettingsService.getAutoplayCounter(guildId)
        return redisCount
    } catch (error) {
        errorLog({ message: "Error getting autoplay count from Redis:", error })
        // Fallback to in-memory map
        return autoplayCounters.get(guildId) ?? 0
    }
}

/**
 * Increment the autoplay count for a guild
 * Uses Redis service with in-memory fallback
 */
export async function incrementAutoplayCount(
    guildId: string,
    count: number = 1,
): Promise<number> {
    try {
        // Try Redis first
        const newCount = await guildSettingsService.incrementAutoplayCounter(
            guildId,
            count,
        )

        // Also update in-memory map for backward compatibility
        const current = autoplayCounters.get(guildId) ?? 0
        autoplayCounters.set(guildId, current + count)

        return newCount
    } catch (error) {
        errorLog({
            message: "Error incrementing autoplay count in Redis:",
            error,
        })
        // Fallback to in-memory map
        const current = autoplayCounters.get(guildId) ?? 0
        const newCount = current + count
        autoplayCounters.set(guildId, newCount)
        return newCount
    }
}

/**
 * Reset the autoplay count for a guild
 * Uses Redis service with in-memory fallback
 */
export async function resetAutoplayCount(guildId: string): Promise<void> {
    try {
        // Try Redis first
        await guildSettingsService.resetAutoplayCounter(guildId)

        // Also update in-memory map for backward compatibility
        autoplayCounters.set(guildId, 0)

        debugLog({ message: `Reset autoplay counter for guild ${guildId}` })
    } catch (error) {
        errorLog({ message: "Error resetting autoplay count in Redis:", error })
        // Fallback to in-memory map
        autoplayCounters.set(guildId, 0)
    }
}

/**
 * Clear all autoplay counters (useful for cleanup)
 * Uses Redis service with in-memory fallback
 */
export async function clearAllAutoplayCounters(): Promise<void> {
    try {
        // Clear in-memory map
        autoplayCounters.clear()

        debugLog({ message: "Cleared all autoplay counters" })
    } catch (error) {
        errorLog({ message: "Error clearing autoplay counters:", error })
    }
}
