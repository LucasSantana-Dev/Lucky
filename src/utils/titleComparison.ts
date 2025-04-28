import { debugLog, errorLog } from './log';
import { artistTitlePatterns, youtubePatterns, artistPatterns } from '@/config/titlePatterns';
import { applyPatterns, calculateSimilarity, normalizeString } from './stringUtils';

// Type definitions
interface ArtistTitle {
    artist: string;
    title: string;
}

interface NormalizedTitle {
    artist: string;
    title: string;
    original: string;
}

type CacheKey = string;
type CacheValue = ArtistTitle;

// Cache for extracted artist/title pairs
const artistTitleCache = new Map<CacheKey, CacheValue>();

/**
 * Type guard to check if a value is a valid title
 */
function isValidTitle(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}

/**
 * Extracts artist and title from a track title with caching
 */
export function extractArtistAndTitle(title: string): ArtistTitle {
    if (!isValidTitle(title)) {
        return { artist: '', title: '' };
    }

    // Check cache first
    if (artistTitleCache.has(title)) {
        return artistTitleCache.get(title)!;
    }

    try {
        const match = artistTitlePatterns.find(pattern => pattern.test(title))?.exec(title);
        const result: ArtistTitle = match ? {
            artist: match[1].trim(),
            title: match[2].trim()
        } : {
            artist: '',
            title: title.trim()
        };

        // Cache the result
        artistTitleCache.set(title, result);
        return result;
    } catch (error) {
        errorLog({ message: 'Error extracting artist and title:', error });
        return { artist: '', title: title.trim() };
    }
}

/**
 * Normalizes a title by removing common patterns and special characters
 */
export function normalizeTitle(title: string): string {
    if (!isValidTitle(title)) return '';
    
    try {
        let normalized = title.toLowerCase();
        normalized = applyPatterns(normalized, youtubePatterns);
        normalized = applyPatterns(normalized, artistPatterns);
        return normalizeString(normalized);
    } catch (error) {
        errorLog({ message: 'Error normalizing title:', error });
        return title.toLowerCase();
    }
}

/**
 * Checks if two titles are similar using multiple comparison methods
 */
export function isSimilarTitle(title1: string, title2: string): boolean {
    if (!isValidTitle(title1) || !isValidTitle(title2)) return false;
    if (title1 === title2) return true;

    try {
        const { artist: artist1, title: titleOnly1 } = extractArtistAndTitle(title1);
        const { artist: artist2, title: titleOnly2 } = extractArtistAndTitle(title2);

        const normalizedArtist1 = normalizeTitle(artist1);
        const normalizedTitle1 = normalizeTitle(titleOnly1);
        const normalizedArtist2 = normalizeTitle(artist2);
        const normalizedTitle2 = normalizeTitle(titleOnly2);

        debugLog({ 
            message: 'Title comparison', 
            data: { 
                original1: title1,
                original2: title2,
                artist1: normalizedArtist1,
                title1: normalizedTitle1,
                artist2: normalizedArtist2,
                title2: normalizedTitle2
            }
        });

        // Quick checks for exact matches
        if (normalizedArtist1 && normalizedArtist2 && normalizedArtist1 === normalizedArtist2) return true;
        if (normalizedTitle1 === normalizedTitle2) return true;

        // Check for substring matches with length threshold
        const minLength = Math.min(normalizedTitle1.length, normalizedTitle2.length);
        if (minLength > 10) { // Only check substrings for titles longer than 10 chars
            if (normalizedTitle1.includes(normalizedTitle2) || normalizedTitle2.includes(normalizedTitle1)) {
                return true;
            }
        }

        // Calculate similarity scores with weighted comparison
        const titleSimilarity = calculateSimilarity(normalizedTitle1, normalizedTitle2);
        const artistSimilarity = normalizedArtist1 && normalizedArtist2 ? 
            calculateSimilarity(normalizedArtist1, normalizedArtist2) : 0;

        // Weighted threshold based on whether we have artist information
        const titleThreshold = normalizedArtist1 && normalizedArtist2 ? 0.6 : 0.8;
        const artistThreshold = 0.8;

        return titleSimilarity > titleThreshold || 
               (artistSimilarity > artistThreshold && titleSimilarity > titleThreshold * 0.8);
    } catch (error) {
        errorLog({ message: 'Error comparing titles:', error });
        return false;
    }
}

function calculateSimilarity(str1: string, str2: string): number {
    const maxLength = Math.max(str1.length, str2.length);
    const distance = levenshteinDistance(str1, str2);
    return 1 - distance / maxLength;
}

function levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (str1[i - 1] === str2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = Math.min(
                    dp[i - 1][j - 1] + 1, // substitution
                    dp[i - 1][j] + 1,     // deletion
                    dp[i][j - 1] + 1      // insertion
                );
            }
        }
    }

    return dp[m][n];
}

// Clear caches periodically to prevent memory leaks
setInterval(() => {
    artistTitleCache.clear();
}, 1000 * 60 * 60); // Clear every hour 