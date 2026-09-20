import { describe, expect, it } from '@jest/globals'
import { DateTime } from 'luxon'

import {
    buildRecurrenceRule,
    computeNextOccurrence,
    DEFAULT_TIMEZONE,
} from './recurrence.js'

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

const SP = DEFAULT_TIMEZONE

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
        const after = at(SP, 2026, 7, 13, 12)
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
        const after = at(SP, 2026, 7, 17, 21)
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
    const rule = buildRecurrenceRule('daily', 8, 0)
    const NY = 'America/New_York'

    it('holds local 08:00 across spring-forward', () => {
        const beforeDst = at(NY, 2026, 3, 7, 9)
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
