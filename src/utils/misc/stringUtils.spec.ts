/**
 * Unit tests for string utilities
 * Testing behavior, not implementation details
 */

import { describe, it, expect } from '@jest/globals'
import {
    applyPatterns,
    calculateSimilarity,
    normalizeString,
} from './stringUtils'

describe('String Utilities', () => {
    describe('normalizeString', () => {
        it('should normalize strings by removing extra spaces', () => {
            expect(normalizeString('Hello   World')).toBe('Hello World')
            expect(normalizeString('  Test  String  ')).toBe('Test String')
            expect(normalizeString('Multiple    Spaces')).toBe('Multiple Spaces')
        })

        it('should handle empty strings', () => {
            expect(normalizeString('')).toBe('')
            expect(normalizeString('   ')).toBe('')
        })
    })

    describe('calculateSimilarity', () => {
        it('should calculate similarity between identical strings', () => {
            expect(calculateSimilarity('hello', 'hello')).toBe(1.0)
            expect(calculateSimilarity('test', 'test')).toBe(1.0)
        })

        it('should calculate similarity between different strings', () => {
            const similarity = calculateSimilarity('hello', 'world')
            expect(similarity).toBeGreaterThan(0)
            expect(similarity).toBeLessThan(1)
        })

        it('should handle empty strings', () => {
            expect(calculateSimilarity('', '')).toBe(1.0)
            expect(calculateSimilarity('hello', '')).toBe(0)
            expect(calculateSimilarity('', 'world')).toBe(0)
        })
    })

    describe('applyPatterns', () => {
        it('should return default values for unknown patterns', () => {
            const result = applyPatterns('Test Song', [])
            expect(result).toEqual({ artist: 'Unknown', title: 'Test Song' })
        })

        it('should handle empty input', () => {
            const result = applyPatterns('', [])
            expect(result).toEqual({ artist: 'Unknown', title: '' })
        })
    })
})
