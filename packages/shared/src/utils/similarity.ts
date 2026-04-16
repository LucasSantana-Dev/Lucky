/**
 * String similarity and distance algorithms
 * Consolidated from: stringUtils.ts, trackSimilarity.ts, similarityChecker.ts, similarityCalculator.ts
 */

/**
 * Calculate Levenshtein distance between two strings.
 * Measures the minimum number of single-character edits required to change one string into another.
 *
 * @param str1 First string
 * @param str2 Second string
 * @returns Levenshtein distance (higher = more different)
 */
export function levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = Array(str2.length + 1)
        .fill(0)
        .map(() => Array(str1.length + 1).fill(0) as number[])

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j

    for (let j = 1; j <= str2.length; j++) {
        for (let i = 1; i <= str1.length; i++) {
            const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1,
                matrix[j - 1][i] + 1,
                matrix[j - 1][i - 1] + indicator,
            )
        }
    }

    return matrix[str2.length][str1.length]
}

/**
 * Calculate Levenshtein-based string similarity score.
 * Normalizes distance by the longer string's length.
 * Returns 1.0 for identical strings, 0.0 for completely different.
 *
 * @param str1 First string
 * @param str2 Second string
 * @returns Similarity score between 0 and 1
 */
export function levenshteinSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2
    const shorter = str1.length > str2.length ? str2 : str1

    if (longer.length === 0) return 1.0

    const distance = levenshteinDistance(longer, shorter)
    return (longer.length - distance) / longer.length
}

/**
 * Calculate Jaccard similarity between two strings based on word/token overlap.
 * Treats strings as sets of space-separated tokens.
 * Returns 1.0 for identical token sets, 0.0 for disjoint sets.
 *
 * @param strA First string
 * @param strB Second string
 * @returns Jaccard similarity score between 0 and 1
 */
export function jaccardSimilarity(strA: string, strB: string): number {
    const setA = new Set(strA.toLowerCase().split(/\s+/).filter(Boolean))
    const setB = new Set(strB.toLowerCase().split(/\s+/).filter(Boolean))

    if (setA.size === 0 && setB.size === 0) return 1.0
    if (setA.size === 0 || setB.size === 0) return 0.0

    const intersection = new Set([...setA].filter(x => setB.has(x)))
    const union = new Set([...setA, ...setB])

    return intersection.size / union.size
}

/**
 * Calculate token overlap ratio between two strings (custom Jaccard variant).
 * Used by musicRecommendation for its recommendation similarity metric.
 * Returns intersection size divided by union size.
 *
 * @param strA First string
 * @param strB Second string
 * @returns Token overlap ratio between 0 and 1
 */
export function tokenOverlapRatio(strA: string, strB: string): number {
    const normalizedA = strA.toLowerCase().trim()
    const normalizedB = strB.toLowerCase().trim()

    if (normalizedA === normalizedB) {
        return 1.0
    }

    const wordsA = normalizedA.split(/\s+/)
    const wordsB = normalizedB.split(/\s+/)
    const commonWords = wordsA.filter((word) => wordsB.includes(word))

    if (commonWords.length === 0) {
        return 0.0
    }

    const union = new Set([...wordsA, ...wordsB])
    return commonWords.length / union.size
}
