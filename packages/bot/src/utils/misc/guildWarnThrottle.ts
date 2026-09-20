/**
 * Per-guild "warn at most once per window" throttle. Each call site that can
 * fire often (a polled getter, a periodic tick) creates its own instance so
 * the window doesn't spam warnLog. Backed by a module-scoped Map that
 * self-prunes stale entries on write, so it never grows unbounded across the
 * many guilds that only ever warn once.
 */
export function createGuildWarnThrottle(windowMs: number): {
    shouldWarn(guildId: string | undefined): boolean
    clear(): void
} {
    const lastWarnAt = new Map<string, number>()

    return {
        shouldWarn(guildId: string | undefined): boolean {
            if (!guildId) return true
            const now = Date.now()
            const last = lastWarnAt.get(guildId)
            if (last !== undefined && now - last < windowMs) return false
            // Evict stale entries on this write instead of on a timer, so the
            // map can't grow unbounded across guilds that warned once and
            // never again.
            for (const [id, at] of lastWarnAt) {
                if (now - at >= windowMs) lastWarnAt.delete(id)
            }
            lastWarnAt.set(guildId, now)
            return true
        },
        clear(): void {
            lastWarnAt.clear()
        },
    }
}
