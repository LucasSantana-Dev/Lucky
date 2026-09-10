import { describe, expect, it } from '@jest/globals'
import { parseDuration } from './duration'

describe('parseDuration', () => {
    it('parses every supported unit', () => {
        expect(parseDuration('30s')).toBe(30 * 1000)
        expect(parseDuration('10m')).toBe(10 * 60 * 1000)
        expect(parseDuration('2h')).toBe(2 * 60 * 60 * 1000)
        expect(parseDuration('1d')).toBe(24 * 60 * 60 * 1000)
    })

    // The regression this function exists for: the giveaway copy omitted `s`,
    // so "30s" parsed for a reminder and returned null for a giveaway (#2328).
    it('accepts seconds, which the giveaway copy used to reject', () => {
        expect(parseDuration('45s')).toBe(45 * 1000)
    })

    it('rejects a missing unit, unknown unit or non-numeric value', () => {
        expect(parseDuration('10')).toBeNull()
        expect(parseDuration('10x')).toBeNull()
        expect(parseDuration('m10')).toBeNull()
        expect(parseDuration('abc')).toBeNull()
        expect(parseDuration('')).toBeNull()
    })

    it('rejects a value with whitespace or a sign rather than coercing it', () => {
        expect(parseDuration(' 10m')).toBeNull()
        expect(parseDuration('10m ')).toBeNull()
        expect(parseDuration('-10m')).toBeNull()
    })

    it('parses without a ceiling when no cap is given', () => {
        expect(parseDuration('9999d')).toBe(9999 * 24 * 60 * 60 * 1000)
    })

    it('rejects only values above the cap when one is given', () => {
        const thirtyDays = 30 * 24 * 60 * 60 * 1000
        expect(parseDuration('30d', thirtyDays)).toBe(thirtyDays)
        expect(parseDuration('31d', thirtyDays)).toBeNull()
        expect(parseDuration('1000h', thirtyDays)).toBeNull()
    })
})
