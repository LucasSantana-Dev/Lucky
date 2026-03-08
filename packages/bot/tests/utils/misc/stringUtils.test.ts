import {
    applyPatterns,
    calculateSimilarity,
    normalizeString,
} from '../../../src/utils/misc/stringUtils'

describe('stringUtils', () => {
    describe('normalizeString', () => {
        it('trims whitespace', () => {
            expect(normalizeString('  hello  ')).toBe('hello')
        })

        it('collapses multiple spaces', () => {
            expect(normalizeString('hello    world')).toBe('hello world')
        })

        it('handles tabs and newlines', () => {
            expect(normalizeString('hello\t\nworld')).toBe('hello world')
        })

        it('returns empty string for whitespace-only input', () => {
            expect(normalizeString('   ')).toBe('')
        })
    })

    describe('calculateSimilarity', () => {
        it('returns 1 for identical strings', () => {
            expect(calculateSimilarity('hello', 'hello')).toBe(1)
        })

        it('returns 1 for two empty strings', () => {
            expect(calculateSimilarity('', '')).toBe(1)
        })

        it('returns 0 for empty vs non-empty', () => {
            expect(calculateSimilarity('', 'hello')).toBe(0)
        })

        it('returns high score for similar strings', () => {
            const score = calculateSimilarity('kitten', 'sitting')
            expect(score).toBeGreaterThan(0.4)
            expect(score).toBeLessThan(0.8)
        })

        it('returns low score for very different strings', () => {
            const score = calculateSimilarity('abcdef', 'zyxwvu')
            expect(score).toBeLessThan(0.3)
        })

        it('is symmetric', () => {
            const ab = calculateSimilarity('hello', 'world')
            const ba = calculateSimilarity('world', 'hello')
            expect(ab).toBeCloseTo(ba, 5)
        })
    })

    describe('applyPatterns', () => {
        it('returns Unknown artist and input as title by default', () => {
            const result = applyPatterns('some input', [])
            expect(result).toEqual({
                artist: 'Unknown',
                title: 'some input',
            })
        })
    })
})
