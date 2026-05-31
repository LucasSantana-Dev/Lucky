import { getPerSourceAcceptance } from '@lucky/shared/services/recommendationTelemetryReadService'
import type { PerSourceRow } from '@lucky/shared/services/recommendationTelemetryReadService'
import { errorLog } from '@lucky/shared/utils'

interface CacheEntry {
    rows: PerSourceRow[]
    fetchedAt: number
}

/**
 * Per-guild in-memory cache of per-source acceptance rates with 5-minute TTL.
 * Used by now-playing embed rendering to avoid a DB query per track.
 */
const acceptanceRateCache = new Map<string, CacheEntry>()

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Get per-source acceptance rates for a guild, with 5-minute caching.
 * If the cached value is fresh, returns it immediately.
 * If stale or missing, fetches from the read service and caches the result.
 * On service error, returns an empty array (graceful degradation).
 *
 * @param guildId - The guild to fetch rates for
 * @returns Array of per-source acceptance rates, or empty on error
 */
export async function getPerSourceAcceptanceRateCached(
    guildId: string,
): Promise<PerSourceRow[]> {
    const cached = acceptanceRateCache.get(guildId)
    const now = Date.now()

    // Check if cached value is still fresh
    if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
        return cached.rows
    }

    // Cache miss or stale; fetch from service
    try {
        const rows = await getPerSourceAcceptance(guildId)
        acceptanceRateCache.set(guildId, { rows, fetchedAt: now })
        return rows
    } catch (err) {
        errorLog({
            message: 'Failed to fetch per-source acceptance rates',
            data: {
                guildId,
                error: err instanceof Error ? err.message : String(err),
            },
        })
        return []
    }
}

/**
 * Clears the entire acceptance rate cache.
 * Called by tests or on guild cleanup.
 */
export function clearAcceptanceCache(): void {
    acceptanceRateCache.clear()
}
