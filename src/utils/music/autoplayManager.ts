/**
 * Autoplay manager for tracking autoplay usage across guilds
 */

// Map to track autoplay counters for each guild
export const autoplayCounters = new Map<string, number>()

/**
 * Get the current autoplay count for a guild
 */
export function getAutoplayCount(guildId: string): number {
    return autoplayCounters.get(guildId) ?? 0
}

/**
 * Increment the autoplay count for a guild
 */
export function incrementAutoplayCount(
    guildId: string,
    count: number = 1,
): void {
    const current = getAutoplayCount(guildId)
    autoplayCounters.set(guildId, current + count)
}

/**
 * Reset the autoplay count for a guild
 */
export function resetAutoplayCount(guildId: string): void {
    autoplayCounters.set(guildId, 0)
}

/**
 * Clear all autoplay counters (useful for cleanup)
 */
export function clearAllAutoplayCounters(): void {
    autoplayCounters.clear()
}
