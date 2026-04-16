import {
    describe,
    it,
    expect,
} from '@jest/globals'

import {
    levenshteinDistance,
    levenshteinSimilarity,
    jaccardSimilarity,
    tokenOverlapRatio,
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
        it('should return 1.0 for identical token sets', () => {
            expect(jaccardSimilarity('hello world', 'hello world')).toBe(1.0)
        })

        it('should return 1.0 for empty strings', () => {
            expect(jaccardSimilarity('', '')).toBe(1.0)
        })

        it('should return 0.0 for completely disjoint token sets', () => {
            expect(jaccardSimilarity('hello world', 'goodbye universe')).toBe(0.0)
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

    describe('tokenOverlapRatio', () => {
        it('should return 1.0 for identical strings', () => {
            expect(tokenOverlapRatio('hello world', 'hello world')).toBe(1.0)
        })

        it('should return 1.0 for empty strings', () => {
            expect(tokenOverlapRatio('', '')).toBe(1.0)
        })

        it('should return 0.0 for completely disjoint tokens', () => {
            expect(tokenOverlapRatio('hello world', 'goodbye universe')).toBe(0.0)
        })

        it('should calculate common tokens correctly', () => {
            expect(tokenOverlapRatio('a b c', 'b c d')).toBeCloseTo(2 / 4, 5)
        })

        it('should be case-insensitive', () => {
            expect(tokenOverlapRatio('Hello World', 'hello world')).toBe(1.0)
        })

        it('should match musicRecommendation behavior', () => {
            const result = tokenOverlapRatio('The Beatles Greatest Hits', 'The Beatles Greatest Hits')
            expect(result).toBe(1.0)
        })

        it('should handle single token', () => {
            expect(tokenOverlapRatio('artist', 'artist')).toBe(1.0)
            expect(tokenOverlapRatio('artist', 'other')).toBe(0.0)
        })

        it('should handle empty vs non-empty', () => {
            expect(tokenOverlapRatio('', 'hello')).toBe(0.0)
            expect(tokenOverlapRatio('hello', '')).toBe(0.0)
        })

        it('should be identical to Jaccard for token overlap', () => {
            const str1 = 'iron maiden'
            const str2 = 'maiden iron maiden'
            expect(tokenOverlapRatio(str1, str2)).toBe(jaccardSimilarity(str1, str2))
        })
    })

    describe('Cross-algorithm consistency', () => {
        it('should have Jaccard and tokenOverlapRatio produce same results', () => {
            const testCases = [
                ['hello world', 'hello world'],
                ['the quick brown fox', 'quick fox'],
                ['', ''],
                ['single', 'multiple tokens here'],
            ]

            testCases.forEach(([str1, str2]) => {
                expect(tokenOverlapRatio(str1, str2)).toBe(jaccardSimilarity(str1, str2))
            })
        })

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
            expect(tokenOverlapRatio('   ', '   ')).toBe(1.0)
        })

        it('should handle special characters', () => {
            expect(levenshteinDistance('test!@#', 'test!@#')).toBe(0)
            expect(jaccardSimilarity('hello world!', 'hello world?')).toBeGreaterThan(0)
        })
    })
})
