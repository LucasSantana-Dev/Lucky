/**
 * Title comparison types and interfaces
 */

export type TitleComparisonOptions = {
    threshold: number
    caseSensitive: boolean
    normalizeWhitespace: boolean
}

export type SimilarityResult = {
    isSimilar: boolean
    score: number
    confidence: number
}
