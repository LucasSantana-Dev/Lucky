import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { cn, formatDate, timeAgo } from './utils'

describe('cn', () => {
    test('joins truthy class names and drops falsy ones', () => {
        expect(cn('a', false, undefined, null, 'b')).toBe('a b')
    })

    test('lets the later tailwind utility win a conflict', () => {
        expect(cn('p-2', 'p-4')).toBe('p-4')
    })
})

describe('formatDate', () => {
    test('formats an ISO date with month, day and year', () => {
        expect(formatDate('2026-03-05T12:00:00')).toMatch(/Mar 5, 2026/)
    })
})

describe('timeAgo', () => {
    const now = new Date('2026-06-15T12:00:00Z')

    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(now)
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()

    test('returns "Just now" under one minute', () => {
        expect(timeAgo(ago(59_000))).toBe('Just now')
    })

    test('returns minutes from one minute up to an hour', () => {
        expect(timeAgo(ago(60_000))).toBe('1m ago')
        expect(timeAgo(ago(59 * 60_000))).toBe('59m ago')
    })

    test('returns hours from one hour up to a day', () => {
        expect(timeAgo(ago(60 * 60_000))).toBe('1h ago')
        expect(timeAgo(ago(23 * 3_600_000))).toBe('23h ago')
    })

    test('returns days from one day up to 30 days', () => {
        expect(timeAgo(ago(24 * 3_600_000))).toBe('1d ago')
        expect(timeAgo(ago(29 * 86_400_000))).toBe('29d ago')
    })

    test('falls back to a formatted date at 30 days or more', () => {
        expect(timeAgo(ago(30 * 86_400_000))).toBe(
            formatDate(ago(30 * 86_400_000)),
        )
    })
})
