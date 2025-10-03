/**
 * String utility functions for text processing and normalization
 */

/**
 * Normalizes a string by removing special characters and converting to lowercase
 */
export function normalizeString(str: string): string {
    return str
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .trim()
}

/**
 * Cleans a string by removing extra whitespace and normalizing spaces
 */
export function cleanString(str: string): string {
    return str.trim().replace(/\s+/g, " ")
}

/**
 * Extracts artist and title from a string in various formats
 */
export function extractArtistTitle(input: string): {
    artist: string
    title: string
} {
    const cleaned = cleanString(input)

    // Try different separators
    const separators = [" - ", ": ", " | "]

    for (const separator of separators) {
        if (cleaned.includes(separator)) {
            const parts = cleaned.split(separator)
            if (parts.length >= 2) {
                return {
                    artist: parts[0].trim(),
                    title: parts.slice(1).join(separator).trim(),
                }
            }
        }
    }

    // If no separator found, treat as title only
    return {
        artist: "",
        title: cleaned,
    }
}

/**
 * Checks if two titles are similar (case-insensitive, normalized)
 */
export function isSimilarTitle(title1: string, title2: string): boolean {
    if (!title1 || !title2) return title1 === title2

    const normalized1 = normalizeString(title1)
    const normalized2 = normalizeString(title2)

    return normalized1 === normalized2
}

/**
 * Removes common prefixes and suffixes from track titles
 */
export function cleanTrackTitle(title: string): string {
    return title
        .replace(
            /^(official video|official audio|official|music video|mv|lyrics|lyric video|audio|video)\s*/i,
            "",
        )
        .replace(
            /\s*(official video|official audio|official|music video|mv|lyrics|lyric video|audio|video)$/i,
            "",
        )
        .replace(/\[.*?\]/g, "") // Remove [brackets]
        .replace(/\(.*?\)/g, "") // Remove (parentheses)
        .trim()
}

/**
 * Extracts year from a string
 */
export function extractYear(str: string): number | null {
    const yearMatch = str.match(/\b(19|20)\d{2}\b/)
    return yearMatch ? parseInt(yearMatch[0], 10) : null
}

/**
 * Checks if a string contains only alphanumeric characters
 */
export function isAlphanumeric(str: string): boolean {
    return /^[a-zA-Z0-9]+$/.test(str)
}

/**
 * Truncates a string to a maximum length with ellipsis
 */
export function truncateString(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str
    return str.substring(0, maxLength - 3) + "..."
}

/**
 * Converts a string to title case
 */
export function toTitleCase(str: string): string {
    return str.replace(
        /\w\S*/g,
        (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase(),
    )
}

/**
 * Removes diacritics from a string
 */
export function removeDiacritics(str: string): string {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

/**
 * Checks if two strings are similar using Levenshtein distance
 */
export function isStringSimilar(
    str1: string,
    str2: string,
    threshold: number = 0.8,
): boolean {
    const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase())
    const maxLength = Math.max(str1.length, str2.length)
    const similarity = 1 - distance / maxLength
    return similarity >= threshold
}

/**
 * Calculates Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1)
        .fill(null)
        .map(() => Array(str1.length + 1).fill(null))

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j

    for (let j = 1; j <= str2.length; j++) {
        for (let i = 1; i <= str1.length; i++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1, // deletion
                matrix[j - 1][i] + 1, // insertion
                matrix[j - 1][i - 1] + cost, // substitution
            )
        }
    }

    return matrix[str2.length][str1.length]
}

/**
 * Applies regex patterns to a string and returns the cleaned result
 */
export function applyPatterns(str: string, patterns: RegExp[]): string {
    let result = str
    for (const pattern of patterns) {
        result = result.replace(pattern, "")
    }
    return result.trim()
}

/**
 * Calculates similarity between two strings using Levenshtein distance
 */
export function calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1
    if (!str1 || !str2) return 0

    const distance = levenshteinDistance(str1, str2)
    const maxLength = Math.max(str1.length, str2.length)
    return 1 - distance / maxLength
}
