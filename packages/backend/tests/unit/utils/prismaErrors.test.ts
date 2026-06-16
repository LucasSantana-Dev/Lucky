import { describe, test, expect } from '@jest/globals'
import { isUniqueViolation } from '../../../src/utils/prismaErrors'

function errorWithCode(code: unknown): Error {
    return Object.assign(new Error('boom'), { code })
}

describe('isUniqueViolation', () => {
    test('true for an Error carrying the P2002 code', () => {
        expect(isUniqueViolation(errorWithCode('P2002'))).toBe(true)
    })

    test('false for an Error with a different prisma code', () => {
        // Pins `=== 'P2002'` (a `!==` or empty-string-literal mutant would
        // accept this) and the second `&&` (an `||` mutant returns true here).
        expect(isUniqueViolation(errorWithCode('P2003'))).toBe(false)
    })

    test('false for an Error with no code property', () => {
        // Pins the `'code' in error` guard against a `false` mutant and the
        // first `&&` against an `||` mutant.
        expect(isUniqueViolation(new Error('plain'))).toBe(false)
    })

    test('false for a non-Error object even when it carries code P2002', () => {
        // Pins `instanceof Error`: a `true`/removed mutant would accept this.
        expect(isUniqueViolation({ code: 'P2002' })).toBe(false)
    })

    test('false for null/undefined/primitive inputs', () => {
        expect(isUniqueViolation(null)).toBe(false)
        expect(isUniqueViolation(undefined)).toBe(false)
        expect(isUniqueViolation('P2002')).toBe(false)
    })
})
