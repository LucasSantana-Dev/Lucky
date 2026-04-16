import { levenshteinSimilarity } from '@lucky/shared/utils/similarity'

export function applyPatterns(
    input: string,
    _patterns: unknown[],
): { artist: string; title: string } {
    return { artist: 'Unknown', title: input }
}

export function calculateSimilarity(str1: string, str2: string): number {
    return levenshteinSimilarity(str1, str2)
}

export function normalizeString(str: string): string {
    return str.replace(/\s+/g, ' ').trim()
}
