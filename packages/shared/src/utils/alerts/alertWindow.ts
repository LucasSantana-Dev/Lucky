const windows = new Map<string, number[]>()
const cooldowns = new Map<string, number>()

// Conservative max window — longer than any caller's windowMs (max is 1h in this codebase).
const MAX_WINDOW_TTL_MS = 2 * 60 * 60_000

function evictExpired(now: number): void {
    for (const [k, exp] of cooldowns) {
        if (exp <= now) cooldowns.delete(k)
    }
    for (const [k, times] of windows) {
        if (times.every((t) => now - t >= MAX_WINDOW_TTL_MS)) windows.delete(k)
    }
}

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
    evictExpired(now)

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
