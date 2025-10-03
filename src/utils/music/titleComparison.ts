import { debugLog, errorLog } from "../general/log"
import {
    artistTitlePatterns,
    youtubePatterns,
    artistPatterns,
} from "../../config/titlePatterns"
import {
    applyPatterns,
    calculateSimilarity,
    normalizeString,
} from "../misc/stringUtils"
import { safeSetInterval } from "../timerManager"

// Type definitions
type ArtistTitle = {
    artist: string
    title: string
}

type CacheKey = string
type CacheValue = ArtistTitle

// LRU cache for extracted artist/title pairs
class LRUCache<K, V> {
    private maxSize: number
    private cache: Map<K, V>
    constructor(maxSize: number) {
        this.maxSize = maxSize
        this.cache = new Map()
    }
    get(key: K): V | undefined {
        if (!this.cache.has(key)) return undefined
        const value = this.cache.get(key)
        if (value !== undefined) {
            this.cache.delete(key)
            this.cache.set(key, value)
        }
        return value
    }
    set(key: K, value: V): void {
        if (this.cache.has(key)) {
            this.cache.delete(key)
        } else if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value
            if (firstKey !== undefined) {
                this.cache.delete(firstKey)
            }
        }
        this.cache.set(key, value)
    }
    clear(): void {
        this.cache.clear()
    }
}

const ARTIST_TITLE_CACHE_SIZE = 2000
const artistTitleCache = new LRUCache<CacheKey, CacheValue>(
    ARTIST_TITLE_CACHE_SIZE,
)

/**
 * Type guard to check if a value is a valid title
 */
function isValidTitle(value: unknown): value is string {
    return typeof value === "string" && value.length > 0
}

/**
 * Extracts artist and title from a track title with caching
 */
export function extractArtistAndTitle(trackTitle: string): ArtistTitle {
    if (!isValidTitle(trackTitle)) {
        return { artist: "", title: "" }
    }

    // Check cache first
    const cachedResult = artistTitleCache.get(trackTitle)
    if (cachedResult) {
        return cachedResult
    }

    try {
        const match = artistTitlePatterns
            .find((pattern) => pattern.test(trackTitle))
            ?.exec(trackTitle)
        const result: ArtistTitle = match
            ? {
                  artist: match[1].trim(),
                  title: match[2].trim(),
              }
            : {
                  artist: "",
                  title: trackTitle.trim(),
              }

        // Cache the result
        artistTitleCache.set(trackTitle, result)
        return result
    } catch (error) {
        errorLog({ message: "Error extracting artist and title:", error })
        return { artist: "", title: trackTitle.trim() }
    }
}

/**
 * Normalizes a title by removing common patterns and special characters
 */
export function normalizeTitle(trackTitle: string): string {
    if (!isValidTitle(trackTitle)) return ""

    try {
        let normalizedTitle = trackTitle.toLowerCase()
        normalizedTitle = applyPatterns(normalizedTitle, youtubePatterns)
        normalizedTitle = applyPatterns(normalizedTitle, artistPatterns)
        return normalizeString(normalizedTitle)
    } catch (error) {
        errorLog({ message: "Error normalizing title:", error })
        return trackTitle.toLowerCase()
    }
}

/**
 * Checks if two titles are similar using multiple comparison methods
 */
export function isSimilarTitle(
    firstTitle: string,
    secondTitle: string,
): boolean {
    if (!isValidTitle(firstTitle) || !isValidTitle(secondTitle)) return false
    if (firstTitle === secondTitle) return true

    try {
        const { artist: firstArtist, title: firstTitleOnly } =
            extractArtistAndTitle(firstTitle)
        const { artist: secondArtist, title: secondTitleOnly } =
            extractArtistAndTitle(secondTitle)

        const normalizedFirstArtist = normalizeTitle(firstArtist)
        const normalizedFirstTitle = normalizeTitle(firstTitleOnly)
        const normalizedSecondArtist = normalizeTitle(secondArtist)
        const normalizedSecondTitle = normalizeTitle(secondTitleOnly)

        debugLog({
            message: "Title comparison",
            data: {
                original1: firstTitle,
                original2: secondTitle,
                artist1: normalizedFirstArtist,
                title1: normalizedFirstTitle,
                artist2: normalizedSecondArtist,
                title2: normalizedSecondTitle,
            },
        })

        // Quick checks for exact matches
        if (
            normalizedFirstArtist &&
            normalizedSecondArtist &&
            normalizedFirstArtist === normalizedSecondArtist
        )
            return true
        if (normalizedFirstTitle === normalizedSecondTitle) return true

        // Check for substring matches with length threshold
        const minTitleLength = Math.min(
            normalizedFirstTitle.length,
            normalizedSecondTitle.length,
        )
        if (minTitleLength > 10) {
            // Only check substrings for titles longer than 10 chars
            if (
                normalizedFirstTitle.includes(normalizedSecondTitle) ||
                normalizedSecondTitle.includes(normalizedFirstTitle)
            ) {
                return true
            }
        }

        // Calculate similarity scores with weighted comparison
        const titleSimilarity = calculateSimilarity(
            normalizedFirstTitle,
            normalizedSecondTitle,
        )
        const artistSimilarity =
            normalizedFirstArtist && normalizedSecondArtist
                ? calculateSimilarity(
                      normalizedFirstArtist,
                      normalizedSecondArtist,
                  )
                : 0

        // Weighted threshold based on whether we have artist information
        const titleThreshold =
            normalizedFirstArtist && normalizedSecondArtist ? 0.6 : 0.8
        const artistThreshold = 0.8

        return (
            titleSimilarity > titleThreshold ||
            (artistSimilarity > artistThreshold &&
                titleSimilarity > titleThreshold * 0.8)
        )
    } catch (error) {
        errorLog({ message: "Error comparing titles:", error })
        return false
    }
}

// Clear caches periodically to prevent memory leaks
safeSetInterval(
    () => {
        artistTitleCache.clear()
    },
    1000 * 60 * 60,
) // Clear every hour
