const windows = new Map<string, number[]>()
const cooldowns = new Map<string, number>()

/**
 * Records an event and returns true if the threshold was just crossed.
 * Resets the window and arms a cooldown on trigger to prevent repeat-fire.
 */
export function recordWithCooldown(
    key: string,
    windowMs: number,
    threshold: number,
    cooldownMs: number,
): boolean {
    const now = Date.now()
    if ((cooldowns.get(key) ?? 0) > now) return false

    const times = (windows.get(key) ?? []).filter((t) => now - t < windowMs)
    times.push(now)
    windows.set(key, times)

    if (times.length >= threshold) {
        cooldowns.set(key, now + cooldownMs)
        windows.delete(key)
        return true
    }
    return false
}

/** Test-only: reset all state. */
export function __resetAlertWindowForTests(): void {
    windows.clear()
    cooldowns.clear()
}
