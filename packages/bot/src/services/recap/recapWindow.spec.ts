import { describe, expect, it } from '@jest/globals'
import { latestRecapBoundary, recapWindow } from './recapWindow'

const at = (iso: string) => new Date(iso)

describe('recapWindow (#2678)', () => {
    it.each([
        // 2026-10-11 is a Sunday.
        ['2026-10-11T18:00:00.000Z', '2026-10-11T18:00:00.000Z'],
        ['2026-10-11T18:30:00.000Z', '2026-10-11T18:00:00.000Z'],
        ['2026-10-11T17:59:59.999Z', '2026-10-04T18:00:00.000Z'],
        ['2026-10-14T09:00:00.000Z', '2026-10-11T18:00:00.000Z'],
        ['2026-10-17T23:59:00.000Z', '2026-10-11T18:00:00.000Z'],
        // Month and year rollovers.
        ['2026-11-02T12:00:00.000Z', '2026-11-01T18:00:00.000Z'],
        ['2027-01-01T00:00:00.000Z', '2026-12-27T18:00:00.000Z'],
    ])('latest boundary for %s is %s', (now, expected) => {
        expect(latestRecapBoundary(at(now)).toISOString()).toBe(expected)
    })

    it('the window is the 7 days ending at the boundary', () => {
        const { from, to } = recapWindow(at('2026-10-11T18:00:00.000Z'))

        expect(from.toISOString()).toBe('2026-10-04T18:00:00.000Z')
        expect(to.toISOString()).toBe('2026-10-11T18:00:00.000Z')
    })
})
