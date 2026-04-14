const replenishSuppressedUntil = new Map<string, number>()

export function setReplenishSuppressed(guildId: string, ms: number): void {
    if (ms <= 0) {
        replenishSuppressedUntil.delete(guildId)
    } else {
        replenishSuppressedUntil.set(guildId, Date.now() + ms)
    }
}

export function isReplenishSuppressed(guildId: string): boolean {
    const suppressedUntil = replenishSuppressedUntil.get(guildId)
    if (!suppressedUntil) return false
    if (Date.now() >= suppressedUntil) {
        replenishSuppressedUntil.delete(guildId)
        return false
    }
    return true
}
