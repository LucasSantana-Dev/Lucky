// Weekly recap timing (#2678, decisions/2026-10-07-lucky-render-rust-sidecar.md):
// one post per opted-in guild for the 7 days ending Sunday 18:00 UTC.
export const RECAP_WEEKDAY_UTC = 0 // Sunday
export const RECAP_HOUR_UTC = 18
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** The most recent Sunday 18:00 UTC at or before `now`. */
export function latestRecapBoundary(now: Date): Date {
    const boundary = new Date(
        Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            RECAP_HOUR_UTC,
        ),
    )
    const daysSinceSunday = (boundary.getUTCDay() - RECAP_WEEKDAY_UTC + 7) % 7
    boundary.setUTCDate(boundary.getUTCDate() - daysSinceSunday)
    if (boundary > now) boundary.setUTCDate(boundary.getUTCDate() - 7)
    return boundary
}

/** The recap window that ends at `boundary`: `[boundary - 7 days, boundary)`. */
export function recapWindow(boundary: Date): { from: Date; to: Date } {
    return { from: new Date(boundary.getTime() - WEEK_MS), to: boundary }
}
