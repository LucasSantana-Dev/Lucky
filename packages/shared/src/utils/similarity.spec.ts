import { describe, it, expect } from '@jest/globals'

import {
    levenshteinDistance,
    levenshteinSimilarity,
    jaccardSimilarity,
} from './similarity'

describe('Similarity Functions', () => {
    describe('levenshteinDistance', () => {
        it('should return 0 for identical strings', () => {
            expect(levenshteinDistance('hello', 'hello')).toBe(0)
        })

        it('should handle empty strings', () => {
            expect(levenshteinDistance('', '')).toBe(0)
            expect(levenshteinDistance('hello', '')).toBe(5)
            expect(levenshteinDistance('', 'hello')).toBe(5)
        })

        it('should calculate distance for single character difference', () => {
            expect(levenshteinDistance('kitten', 'sitting')).toBe(3)
        })

        it('should handle completely different strings', () => {
            expect(levenshteinDistance('abc', 'def')).toBe(3)
        })

        it('should be case-sensitive', () => {
            expect(levenshteinDistance('Hello', 'hello')).toBe(1)
        })

        it('should handle unicode characters', () => {
            expect(levenshteinDistance('café', 'cafe')).toBe(1)
            expect(levenshteinDistance('你好', '你好')).toBe(0)
        })
    })

    describe('levenshteinSimilarity', () => {
        it('should return 1.0 for identical strings', () => {
            expect(levenshteinSimilarity('hello', 'hello')).toBe(1.0)
        })

        it('should return 1.0 for empty strings', () => {
            expect(levenshteinSimilarity('', '')).toBe(1.0)
        })

        it('should return 0 for completely different strings', () => {
            expect(levenshteinSimilarity('abc', 'xyz')).toBe(0)
        })

        it('should normalize by longer string length', () => {
            const similarity = levenshteinSimilarity('kitten', 'sitting')
            expect(similarity).toBeCloseTo(4 / 7, 5)
        })

        it('should handle empty vs non-empty', () => {
            expect(levenshteinSimilarity('', 'hello')).toBe(0)
            expect(levenshteinSimilarity('hello', '')).toBe(0)
        })

        it('should be case-sensitive', () => {
            const result = levenshteinSimilarity('Hello', 'hello')
            expect(result).toBeLessThan(1.0)
        })

        it('should match original stringUtils behavior', () => {
            expect(levenshteinSimilarity('love', 'live')).toBeCloseTo(0.75, 5)
        })

        it('should handle unicode', () => {
            expect(levenshteinSimilarity('café', 'cafe')).toBeLessThan(1.0)
            expect(levenshteinSimilarity('你好世界', '你好世界')).toBe(1.0)
        })
    })

    describe('jaccardSimilarity', () => {
        it('stays bounded to [0,1] and symmetric with duplicate tokens', () => {
            // Regression: the former tokenOverlapRatio counted duplicate tokens
            // in the numerator but deduped the denominator, returning >1.0 and
            // being asymmetric. Jaccard (set-based) must not.
            expect(jaccardSimilarity('the the beatles', 'the beatles')).toBe(
                1.0,
            )
            expect(jaccardSimilarity('the beatles', 'the the beatles')).toBe(
                1.0,
            )
            expect(jaccardSimilarity('a a b', 'a b')).toBeLessThanOrEqual(1.0)
        })

        it('should return 1.0 for identical token sets', () => {
            expect(jaccardSimilarity('hello world', 'hello world')).toBe(1.0)
        })

        it('should return 1.0 for empty strings', () => {
            expect(jaccardSimilarity('', '')).toBe(1.0)
        })

        it('should return 0.0 for completely disjoint token sets', () => {
            expect(jaccardSimilarity('hello world', 'goodbye universe')).toBe(
                0.0,
            )
        })

        it('should calculate intersection/union correctly', () => {
            expect(jaccardSimilarity('a b c', 'b c d')).toBeCloseTo(2 / 4, 5)
        })

        it('should be case-insensitive', () => {
            expect(jaccardSimilarity('Hello World', 'hello world')).toBe(1.0)
        })

        it('should ignore whitespace variations', () => {
            expect(jaccardSimilarity('hello  world', 'hello world')).toBe(1.0)
        })

        it('should handle single word', () => {
            expect(jaccardSimilarity('hello', 'hello')).toBe(1.0)
            expect(jaccardSimilarity('hello', 'world')).toBe(0.0)
        })

        it('should match trackSimilarity behavior', () => {
            const result = jaccardSimilarity('The Beatles', 'The Beatles')
            expect(result).toBe(1.0)
        })

        it('should handle empty vs non-empty', () => {
            expect(jaccardSimilarity('', 'hello')).toBe(0.0)
            expect(jaccardSimilarity('hello', '')).toBe(0.0)
        })

        it('should handle unicode tokens', () => {
            expect(jaccardSimilarity('你好 世界', '你好 世界')).toBe(1.0)
        })
    })

    describe('Cross-algorithm consistency', () => {
        it('Levenshtein should work differently from token-based', () => {
            const str1 = 'hello'
            const str2 = 'hallo'
            const levenDist = levenshteinSimilarity(str1, str2)
            const jaccard = jaccardSimilarity(str1, str2)

            expect(levenDist).not.toBe(jaccard)
            expect(levenDist).toBeGreaterThan(jaccard)
        })
    })

    describe('Edge cases', () => {
        it('should handle very long strings', () => {
            const long1 = 'a'.repeat(1000)
            const long2 = 'a'.repeat(1000)
            expect(levenshteinSimilarity(long1, long2)).toBe(1.0)
        })

        it('should handle whitespace-only strings', () => {
            expect(jaccardSimilarity('   ', '   ')).toBe(1.0)
        })

        it('should handle special characters', () => {
            expect(levenshteinDistance('test!@#', 'test!@#')).toBe(0)
            expect(
                jaccardSimilarity('hello world!', 'hello world?'),
            ).toBeGreaterThan(0)
        })
    })
})
