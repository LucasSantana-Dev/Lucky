/**
 * Parse a short human duration like "30s", "10m", "2h", "1d" into milliseconds.
 * Returns null for anything that does not match, including a bare number, a
 * missing unit, or an unknown unit.
 *
 * Parsing is deliberately separate from policy: the maximum a caller accepts is
 * that caller's rule, not the parser's. `/remind` allows 30 days and `/giveaway`
 * allows 14 with its own user-facing message, so pass `maxMs` when the limit
 * should reject the value here, and leave it off to parse without a ceiling.
 *
 * This replaced two copies that had already drifted: the giveaway one omitted
 * `s`, so "30s" worked for a reminder and silently failed for a giveaway (#2328).
 */
const UNIT_MS: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
}

export function parseDuration(input: string, maxMs?: number): number | null {
    const match = /^(\d+)([smhd])$/.exec(input)
    if (!match) return null

    const unitMs = UNIT_MS[match[2]]
    if (unitMs === undefined) return null

    const ms = Number.parseInt(match[1], 10) * unitMs
    // The regex accepts any number of digits, so a long enough value multiplies
    // past Number.MAX_SAFE_INTEGER and returns an inexact result or Infinity.
    if (!Number.isSafeInteger(ms)) return null
    if (maxMs !== undefined && ms > maxMs) return null
    return ms
}
