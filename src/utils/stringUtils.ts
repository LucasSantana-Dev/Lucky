import { debugLog, errorLog } from './log';

// Type definitions
type CacheKey = string;
type CacheValue = string;
type PatternArray = readonly RegExp[];

// Cache for memoized functions
const memoizedResults = new Map<CacheKey, CacheValue>();

/**
 * Type guard to check if a value is a valid string
 */
function isValidString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}

/**
 * Type guard to check if a value is a valid pattern array
 */
function isValidPatternArray(value: unknown): value is PatternArray {
    return Array.isArray(value) && value.every(pattern => pattern instanceof RegExp);
}

/**
 * Applies multiple regex patterns to a string with memoization
 */
export function applyPatterns(text: string, patterns: PatternArray): string {
    if (!isValidString(text) || !isValidPatternArray(patterns)) {
        return text;
    }

    const cacheKey = `${text}-${patterns.map(p => p.toString()).join('|')}`;
    if (memoizedResults.has(cacheKey)) {
        return memoizedResults.get(cacheKey)!;
    }

    const result = patterns.reduce((result, pattern) => result.replace(pattern, ''), text);
    memoizedResults.set(cacheKey, result);
    return result;
}

/**
 * Calculates similarity between two strings using Levenshtein distance
 * Optimized with early returns for common cases
 */
export function calculateSimilarity(str1: string, str2: string): number {
    if (!isValidString(str1) || !isValidString(str2)) {
        return 0;
    }

    // Early returns for common cases
    if (str1 === str2) return 1;
    if (str1.length === 1 && str2.length === 1) return str1 === str2 ? 1 : 0;

    const maxLength = Math.max(str1.length, str2.length);
    const distance = levenshteinDistance(str1, str2);
    return 1 - distance / maxLength;
}

/**
 * Calculates Levenshtein distance between two strings
 * Optimized with space complexity O(min(m,n))
 */
function levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    
    // Use the shorter string for the dp array to save space
    if (m < n) {
        [str1, str2] = [str2, str1];
        [m, n] = [n, m];
    }

    let prev = Array(n + 1).fill(0);
    let curr = Array(n + 1).fill(0);

    for (let j = 0; j <= n; j++) prev[j] = j;

    for (let i = 1; i <= m; i++) {
        curr[0] = i;
        for (let j = 1; j <= n; j++) {
            if (str1[i - 1] === str2[j - 1]) {
                curr[j] = prev[j - 1];
            } else {
                curr[j] = Math.min(
                    prev[j - 1] + 1, // substitution
                    prev[j] + 1,     // deletion
                    curr[j - 1] + 1  // insertion
                );
            }
        }
        [prev, curr] = [curr, prev];
    }

    return prev[n];
}

/**
 * Normalizes a string by removing special characters and extra spaces
 * Optimized with a single regex pass
 */
export function normalizeString(str: string): string {
    if (!isValidString(str)) {
        return '';
    }
    return str.toLowerCase().replace(/[^\w\s]|\s+/g, ' ').trim();
}

// Clear memoization cache periodically to prevent memory leaks
setInterval(() => {
    memoizedResults.clear();
}, 1000 * 60 * 60); // Clear every hour 