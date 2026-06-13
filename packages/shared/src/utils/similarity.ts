/**
 * String similarity and distance algorithms
 * Consolidated from: stringUtils.ts, trackSimilarity.ts, similarityChecker.ts, similarityCalculator.ts
 */

/**
 * Calculate Levenshtein distance between two strings.
 * Measures the minimum number of single-character edits required to change one string into another.
 *
 * Uses a two-row rolling buffer over the shorter string, so memory is O(min(n, m))
 * rather than the O(n·m) of a full matrix.
 *
 * @param str1 First string
 * @param str2 Second string
 * @returns Levenshtein distance (higher = more different)
 */
export function levenshteinDistance(str1: string, str2: string): number {
    if (str1 === str2) return 0

    // Iterate columns over the shorter string so the buffers stay O(min(n, m)).
    let a = str1
    let b = str2
    if (a.length > b.length) {
        const tmp = a
        a = b
        b = tmp
    }

    const m = a.length
    const n = b.length
    if (m === 0) return n

    let prev: number[] = Array.from({ length: m + 1 }, (_, i) => i)
    let curr: number[] = new Array<number>(m + 1)

    for (let j = 1; j <= n; j++) {
        curr[0] = j
        for (let i = 1; i <= m; i++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1
            curr[i] = Math.min(
                curr[i - 1] + 1, // insertion
                prev[i] + 1, // deletion
                prev[i - 1] + cost, // substitution
            )
        }
        const tmp = prev
        prev = curr
        curr = tmp
    }

    return prev[m]
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
 * Treats strings as sets of space-separated tokens (duplicate tokens within a
 * string collapse to one). Returns 1.0 for identical token sets, 0.0 for disjoint
 * sets — always bounded to [0, 1] and symmetric in its arguments.
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

    const intersection = new Set([...setA].filter((x) => setB.has(x)))
    const union = new Set([...setA, ...setB])

    return intersection.size / union.size
}
