import { describe, expect, it } from '@jest/globals'
import { DateTime } from 'luxon'

import {
    buildRecurrenceRule,
    computeNextOccurrence,
    DEFAULT_TIMEZONE,
} from './recurrence.js'

// Helper: assert the next occurrence equals a wall-clock in a zone.
function expectLocal(
    next: Date | null,
    zone: string,
    y: number,
    mo: number,
    d: number,
    h: number,
    mi: number,
): void {
    expect(next).not.toBeNull()
    const local = DateTime.fromJSDate(next as Date).setZone(zone)
    expect([
        local.year,
        local.month,
        local.day,
        local.hour,
        local.minute,
    ]).toEqual([y, mo, d, h, mi])
}

const SP = DEFAULT_TIMEZONE // America/Sao_Paulo

// Build a JS Date from a wall-clock in a zone (collapses the repeated
// DateTime.fromObject(...).toJSDate() setup across cases).
function at(
    zone: string,
    y: number,
    mo: number,
    d: number,
    h: number,
    mi = 0,
): Date {
    return DateTime.fromObject(
        { year: y, month: mo, day: d, hour: h, minute: mi },
        { zone },
    ).toJSDate()
}

describe('buildRecurrenceRule', () => {
    it('weekdays at 20:00', () => {
        expect(buildRecurrenceRule('weekdays', 20, 0)).toBe(
            'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=20;BYMINUTE=0;BYSECOND=0',
        )
    })
    it('weekly on Friday (5) at 19:00', () => {
        expect(buildRecurrenceRule('weekly', 19, 0, 5)).toBe(
            'FREQ=WEEKLY;BYDAY=FR;BYHOUR=19;BYMINUTE=0;BYSECOND=0',
        )
    })
    it('daily at 08:30', () => {
        expect(buildRecurrenceRule('daily', 8, 30)).toBe(
            'FREQ=DAILY;BYHOUR=8;BYMINUTE=30;BYSECOND=0',
        )
    })
    it('weekly without a weekday throws', () => {
        expect(() => buildRecurrenceRule('weekly', 19, 0)).toThrow()
    })
})

describe('computeNextOccurrence — every weekday at 20:00 SP', () => {
    const rule = buildRecurrenceRule('weekdays', 20, 0)

    it('same day when before the time (Mon 12:00 -> Mon 20:00)', () => {
        const after = at(SP, 2026, 7, 13, 12) // 2026-07-13 is a Monday
        expectLocal(
            computeNextOccurrence(rule, SP, after),
            SP,
            2026,
            7,
            13,
            20,
            0,
        )
    })

    it('next day when past the time (Mon 20:30 -> Tue 20:00)', () => {
        const after = at(SP, 2026, 7, 13, 20, 30)
        expectLocal(
            computeNextOccurrence(rule, SP, after),
            SP,
            2026,
            7,
            14,
            20,
            0,
        )
    })

    it('skips the weekend (Fri 21:00 -> Mon 20:00)', () => {
        const after = at(SP, 2026, 7, 17, 21) // 2026-07-17 is a Friday
        expectLocal(
            computeNextOccurrence(rule, SP, after),
            SP,
            2026,
            7,
            20,
            20,
            0,
        )
    })
})

describe('computeNextOccurrence — bounded rules are unsupported', () => {
    // A fixed year-2000 dtstart makes every COUNT/UNTIL occurrence historical,
    // so the function returns null (stop) rather than silently mis-scheduling.
    const after = at(SP, 2026, 7, 13, 12)
    it('returns null for a COUNT-bounded rule', () => {
        expect(
            computeNextOccurrence(
                'FREQ=DAILY;COUNT=1;BYHOUR=8;BYMINUTE=0',
                SP,
                after,
            ),
        ).toBeNull()
    })
    it('returns null for an UNTIL-bounded rule', () => {
        expect(
            computeNextOccurrence(
                'FREQ=DAILY;UNTIL=20260101T000000Z;BYHOUR=8;BYMINUTE=0',
                SP,
                after,
            ),
        ).toBeNull()
    })
})

describe('computeNextOccurrence — every Friday at 19:00 SP', () => {
    const rule = buildRecurrenceRule('weekly', 19, 0, 5)
    it('Mon -> next Friday 19:00', () => {
        const after = at(SP, 2026, 7, 13, 9)
        expectLocal(
            computeNextOccurrence(rule, SP, after),
            SP,
            2026,
            7,
            17,
            19,
            0,
        )
    })
})

describe('computeNextOccurrence — DST correctness (America/New_York)', () => {
    // US spring-forward 2026: 02:00 -> 03:00 on Sun 2026-03-08. A daily 08:00
    // reminder must stay at local 08:00 on both sides of the transition.
    const rule = buildRecurrenceRule('daily', 8, 0)
    const NY = 'America/New_York'

    it('holds local 08:00 across spring-forward', () => {
        const beforeDst = at(NY, 2026, 3, 7, 9) // Sat before the change
        // next = Sun 2026-03-08 08:00 local (a DST-transition day)
        expectLocal(
            computeNextOccurrence(rule, NY, beforeDst),
            NY,
            2026,
            3,
            8,
            8,
            0,
        )

        const onDst = at(NY, 2026, 3, 8, 9)
        // next = Mon 2026-03-09 08:00 local
        expectLocal(
            computeNextOccurrence(rule, NY, onDst),
            NY,
            2026,
            3,
            9,
            8,
            0,
        )
    })
})
