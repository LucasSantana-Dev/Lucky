import { RRule } from 'rrule'
import { DateTime } from 'luxon'

/**
 * Recurrence patterns exposed by the /remind command. Each maps to an RRULE
 * BYDAY set; the time-of-day is supplied separately and encoded as BYHOUR/
 * BYMINUTE. `weekly` additionally pins a single BYDAY (the chosen day).
 */
export type RecurrencePattern = 'daily' | 'weekdays' | 'weekends' | 'weekly'

/** IANA zone used when a reminder has no explicit timezone. */
export const DEFAULT_TIMEZONE = 'America/Sao_Paulo'

/** True if `tz` is a valid IANA timezone the runtime recognises. */
export function isValidTimezone(tz: string): boolean {
    try {
        Intl.DateTimeFormat(undefined, { timeZone: tz })
        return true
    } catch {
        return false
    }
}

const WEEKDAY_BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR']
const WEEKEND_BYDAY = ['SA', 'SU']
// RRULE weekday tokens indexed 0 = Monday … 6 = Sunday, matching luxon weekday.
const BYDAY_TOKENS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

/**
 * Build an RFC-5545 RRULE string for a recurrence pattern firing at
 * `hour`:`minute` (24h, in the reminder's timezone). For `weekly`, `weekday`
 * is a luxon weekday number (1 = Monday … 7 = Sunday). Returns the RRULE body
 * only (no DTSTART) — the timezone is stored alongside and applied at compute
 * time, keeping the rule zone-agnostic.
 */
export function buildRecurrenceRule(
    pattern: RecurrencePattern,
    hour: number,
    minute: number,
    weekday?: number,
): string {
    const time = `BYHOUR=${hour};BYMINUTE=${minute};BYSECOND=0`
    switch (pattern) {
        case 'daily':
            return `FREQ=DAILY;${time}`
        case 'weekdays':
            return `FREQ=WEEKLY;BYDAY=${WEEKDAY_BYDAY.join(',')};${time}`
        case 'weekends':
            return `FREQ=WEEKLY;BYDAY=${WEEKEND_BYDAY.join(',')};${time}`
        case 'weekly': {
            if (weekday === undefined) {
                throw new Error('weekly recurrence requires a weekday')
            }
            const token = BYDAY_TOKENS[weekday - 1]
            return `FREQ=WEEKLY;BYDAY=${token};${time}`
        }
    }
}

/**
 * Compute the next fire instant strictly after `after` for an RRULE evaluated
 * in `timezone`. Returns null when the rule has no further occurrences
 * (e.g. a COUNT/UNTIL-bounded rule that is exhausted).
 *
 * rrule is timezone-naive — it treats all Dates as UTC wall-clock. To honour
 * `timezone` we (1) express `after` as its wall-clock in that zone as a naive
 * UTC Date, (2) let rrule find the next naive occurrence, then (3) reinterpret
 * that naive wall-clock as a real instant in `timezone`. Step 3 is where DST is
 * resolved: luxon maps the local 20:00 to the correct UTC offset for that date.
 */
export function computeNextOccurrence(
    ruleStr: string,
    timezone: string,
    after: Date,
): Date | null {
    const zone = timezone || DEFAULT_TIMEZONE

    const afterLocal = DateTime.fromJSDate(after).setZone(zone)
    const afterNaive = new Date(
        Date.UTC(
            afterLocal.year,
            afterLocal.month - 1,
            afterLocal.day,
            afterLocal.hour,
            afterLocal.minute,
            afterLocal.second,
        ),
    )

    // dtstart floors the search; the actual fire time is pinned by BYHOUR/
    // BYMINUTE, so a fixed early dtstart just gives rrule a valid anchor.
    const options = RRule.parseString(ruleStr)
    // Bounded rules (COUNT/UNTIL) are not supported: the fixed year-2000 dtstart
    // would make every counted/until-bounded occurrence historical, so `after()`
    // returns null and the reminder silently never fires. buildRecurrenceRule
    // never emits these, so reject them explicitly rather than mis-schedule.
    if (options.count != null || options.until != null) return null
    options.dtstart = new Date(Date.UTC(2000, 0, 1, 0, 0, 0))
    const rule = new RRule(options)

    const nextNaive = rule.after(afterNaive, false)
    if (!nextNaive) return null

    const nextLocal = DateTime.fromObject(
        {
            year: nextNaive.getUTCFullYear(),
            month: nextNaive.getUTCMonth() + 1,
            day: nextNaive.getUTCDate(),
            hour: nextNaive.getUTCHours(),
            minute: nextNaive.getUTCMinutes(),
            second: nextNaive.getUTCSeconds(),
        },
        { zone },
    )

    return nextLocal.toJSDate()
}
