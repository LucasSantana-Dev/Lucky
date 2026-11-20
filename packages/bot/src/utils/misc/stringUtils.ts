import { levenshteinSimilarity } from '@lucky/shared/utils/similarity'

export function calculateSimilarity(str1: string, str2: string): number {
    return levenshteinSimilarity(str1, str2)
}

export function normalizeString(str: string): string {
    return str.replace(/\s+/g, ' ').trim()
}
