/**
 * Title comparison types and interfaces
 */

export type ArtistTitle = {
    artist: string
    title: string
}

export type CacheKey = string
export type CacheValue = ArtistTitle

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
