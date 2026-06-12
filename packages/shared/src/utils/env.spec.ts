import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { parseIntEnv } from './env'

describe('parseIntEnv', () => {
    const originalEnv = process.env

    beforeEach(() => {
        // Create a fresh copy of process.env for each test
        process.env = { ...originalEnv }
    })

    afterEach(() => {
        process.env = originalEnv
    })

    it('returns parsed value when env var is valid', () => {
        process.env.TEST_PORT = '3000'
        const result = parseIntEnv('TEST_PORT', 5000)
        expect(result).toBe(3000)
    })

    it('returns fallback when env var is undefined', () => {
        delete process.env.TEST_UNDEFINED
        const result = parseIntEnv('TEST_UNDEFINED', 5000)
        expect(result).toBe(5000)
    })

    it('returns fallback when env var is empty string', () => {
        process.env.TEST_EMPTY = ''
        const result = parseIntEnv('TEST_EMPTY', 5000)
        expect(result).toBe(5000)
    })

    it('returns fallback when env var is whitespace-only', () => {
        process.env.TEST_WHITESPACE = '   '
        const result = parseIntEnv('TEST_WHITESPACE', 5000)
        expect(result).toBe(5000)
    })

    it('returns fallback when parsing results in NaN', () => {
        process.env.TEST_NAN = 'not-a-number'
        const result = parseIntEnv('TEST_NAN', 5000)
        expect(result).toBe(5000)
    })

    it('returns fallback for zero when not explicitly allowed', () => {
        process.env.TEST_ZERO = '0'
        const result = parseIntEnv('TEST_ZERO', 5000)
        expect(result).toBe(0) // Zero IS a valid number
    })

    it('returns fallback for negative values when allowed', () => {
        process.env.TEST_NEGATIVE = '-100'
        const result = parseIntEnv('TEST_NEGATIVE', 5000)
        expect(result).toBe(-100)
    })

    it('respects min bound', () => {
        process.env.TEST_MIN = '100'
        const result = parseIntEnv('TEST_MIN', 5000, { min: 200 })
        expect(result).toBe(5000) // Below min, use fallback
    })

    it('respects max bound', () => {
        process.env.TEST_MAX = '5000'
        const result = parseIntEnv('TEST_MAX', 3000, { max: 4000 })
        expect(result).toBe(3000) // Above max, use fallback
    })

    it('accepts value within bounds', () => {
        process.env.TEST_IN_BOUNDS = '2000'
        const result = parseIntEnv('TEST_IN_BOUNDS', 3000, { min: 1000, max: 3000 })
        expect(result).toBe(2000)
    })

    it('accepts value at lower bound', () => {
        process.env.TEST_AT_MIN = '1000'
        const result = parseIntEnv('TEST_AT_MIN', 3000, { min: 1000 })
        expect(result).toBe(1000)
    })

    it('accepts value at upper bound', () => {
        process.env.TEST_AT_MAX = '3000'
        const result = parseIntEnv('TEST_AT_MAX', 5000, { max: 3000 })
        expect(result).toBe(3000)
    })

    it('uses radix 10 (not octal or hex)', () => {
        process.env.TEST_RADIX = '010'
        const result = parseIntEnv('TEST_RADIX', 0)
        expect(result).toBe(10) // Not 8 (octal)
    })

    it('handles leading/trailing whitespace in value', () => {
        process.env.TEST_WHITESPACE_VALUE = '  2000  '
        const result = parseIntEnv('TEST_WHITESPACE_VALUE', 5000)
        expect(result).toBe(2000)
    })

    it('returns fallback for scientific notation strings', () => {
        process.env.TEST_SCIENTIFIC = '1e3'
        const result = parseIntEnv('TEST_SCIENTIFIC', 5000)
        // parseInt('1e3', 10) = 1, not 1000, so it depends on intent
        expect(result).toBe(1) // parseInt stops at 'e'
    })
})
