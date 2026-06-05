import { describe, it, expect } from '@jest/globals'
import { formatDurationClock, formatDurationHuman } from './formatDuration'

describe('formatDurationClock', () => {
    it('formats seconds under 1 minute', () => {
        expect(formatDurationClock(30)).toBe('0:30')
        expect(formatDurationClock(59)).toBe('0:59')
    })

    it('formats minutes under 1 hour', () => {
        expect(formatDurationClock(60)).toBe('1:00')
        expect(formatDurationClock(90)).toBe('1:30')
        expect(formatDurationClock(3599)).toBe('59:59')
    })

    it('formats hours >= 1 hour', () => {
        expect(formatDurationClock(3600)).toBe('1:00:00')
        expect(formatDurationClock(3661)).toBe('1:01:01')
        expect(formatDurationClock(7322)).toBe('2:02:02')
    })

    it('clamps zero and negative values', () => {
        expect(formatDurationClock(0)).toBe('0:00')
        expect(formatDurationClock(-1)).toBe('0:00')
        expect(formatDurationClock(-100)).toBe('0:00')
    })

    it('floors fractional seconds', () => {
        expect(formatDurationClock(90.9)).toBe('1:30')
        expect(formatDurationClock(90.1)).toBe('1:30')
    })
})

describe('formatDurationHuman', () => {
    it('formats seconds', () => {
        expect(formatDurationHuman(0)).toBe('0 seconds')
        expect(formatDurationHuman(30)).toBe('30 seconds')
        expect(formatDurationHuman(59)).toBe('59 seconds')
    })

    it('formats minutes with correct singular/plural', () => {
        expect(formatDurationHuman(60)).toBe('1 minute')
        expect(formatDurationHuman(90)).toBe('1 minute')
        expect(formatDurationHuman(120)).toBe('2 minutes')
        expect(formatDurationHuman(3599)).toBe('59 minutes')
    })

    it('formats hours with correct singular/plural', () => {
        expect(formatDurationHuman(3600)).toBe('1 hour')
        expect(formatDurationHuman(7200)).toBe('2 hours')
        expect(formatDurationHuman(86399)).toBe('23 hours')
    })

    it('formats days with correct singular/plural', () => {
        expect(formatDurationHuman(86400)).toBe('1 day')
        expect(formatDurationHuman(172800)).toBe('2 days')
    })

    it('treats non-finite/negative input as zero', () => {
        expect(formatDurationHuman(NaN)).toBe('0 seconds')
        expect(formatDurationHuman(Infinity)).toBe('0 seconds')
        expect(formatDurationHuman(-5)).toBe('0 seconds')
        expect(formatDurationClock(NaN)).toBe('0:00')
        expect(formatDurationClock(Infinity)).toBe('0:00')
    })
})
