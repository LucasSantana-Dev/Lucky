import { warnLog } from '@lucky/shared/utils'
import { interactionExpiredTotal } from '../monitoring/prometheus'

/** Discord's "Unknown interaction": the 3 s acknowledge window passed. */
const DISCORD_UNKNOWN_INTERACTION = 10062

/**
 * True when the error, or one of its causes, is Discord's 10062. Used for the
 * wrapped defer failure too, which keeps the raw error as `cause`. Walks the
 * whole cause chain; the visited set makes cyclic chains terminate.
 */
export function isExpiredInteractionError(error: unknown): boolean {
    const seen = new Set<unknown>()
    let current: unknown = error
    while (typeof current === 'object' && current !== null) {
        if (seen.has(current)) return false
        seen.add(current)
        if (
            (current as { code?: unknown }).code === DISCORD_UNKNOWN_INTERACTION
        )
            return true
        current = (current as { cause?: unknown }).cause
    }
    return false
}

/**
 * An interaction that expired before the bot answered is expected under load
 * and the user already sees Discord's own failure message: count it per
 * command or button and log a warning, but do not report it to Sentry.
 * `source` must be a bounded label (command name or button family).
 */
export function recordExpiredInteraction(
    source: string,
    guildId?: string | null,
): void {
    interactionExpiredTotal.labels(source).inc()
    try {
        warnLog({
            message: 'Interaction expired before the bot acknowledged it',
            data: { source, guildId: guildId ?? undefined },
        })
    } catch {
        // A failing log sink must not turn an expected expiry into an error.
    }
}
