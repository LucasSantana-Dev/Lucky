import { debugLog, errorLog } from '@lukbot/shared/utils'
import {
    artistTitlePatterns,
    youtubePatterns,
    artistPatterns,
} from '@lukbot/shared/config'
import {
    applyPatterns,
    calculateSimilarity,
    normalizeString,
} from '@utils/misc/stringUtils'
import { safeSetInterval } from '@lukbot/shared/utils'
import type {
    ArtistTitle,
    TitleComparisonOptions,
    SimilarityResult,
} from './types'

/**
 * Title comparison service
 */
export class TitleComparisonService {
    private readonly cache: Map<string, ArtistTitle> = new Map()
    private readonly maxCacheSize = 1000
    private readonly options: TitleComparisonOptions = {
        threshold: 0.8,
        caseSensitive: false,
        normalizeWhitespace: true,
    }

    constructor(options?: Partial<TitleComparisonOptions>) {
        if (options) {
            this.options = { ...this.options, ...options }
        }
        this.startCacheCleanup()
    }

    extractArtistTitle(input: string): ArtistTitle {
        const cacheKey = input.toLowerCase()

        const cached = this.cache.get(cacheKey)
        if (cached !== undefined) {
            return cached
        }

        const result = this.performExtraction(input)
        this.cacheResult(cacheKey, result)
        return result
    }

    isSimilarTitle(title1: string, title2: string): boolean {
        const normalized1 = this.normalizeTitle(title1)
        const normalized2 = this.normalizeTitle(title2)

        const similarity = calculateSimilarity(normalized1, normalized2)
        return similarity >= this.options.threshold
    }

    calculateSimilarity(title1: string, title2: string): SimilarityResult {
        const normalized1 = this.normalizeTitle(title1)
        const normalized2 = this.normalizeTitle(title2)

        const score = calculateSimilarity(normalized1, normalized2)
        const confidence = Math.min(score / this.options.threshold, 1)

        return {
            isSimilar: score >= this.options.threshold,
            score,
            confidence,
        }
    }

    private performExtraction(input: string): ArtistTitle {
        try {
            // Apply patterns to extract artist and title
            const patterns = [
                ...artistTitlePatterns,
                ...youtubePatterns,
                ...artistPatterns,
            ]

            const result = applyPatterns(input, patterns)

            if (result.artist && result.title) {
                return {
                    artist: result.artist.trim(),
                    title: result.title.trim(),
                }
            }

            // Fallback: treat entire input as title
            return {
                artist: 'Unknown',
                title: input.trim(),
            }
        } catch (error) {
            errorLog({ message: 'Error extracting artist/title:', error })
            return {
                artist: 'Unknown',
                title: input.trim(),
            }
        }
    }

    private normalizeTitle(title: string): string {
        let normalized = title

        if (!this.options.caseSensitive) {
            normalized = normalized.toLowerCase()
        }

        if (this.options.normalizeWhitespace) {
            normalized = normalizeString(normalized)
        }

        return normalized
    }

    private cacheResult(key: string, result: ArtistTitle): void {
        if (this.cache.size >= this.maxCacheSize) {
            const firstKey = this.cache.keys().next().value
            if (firstKey) {
                this.cache.delete(firstKey)
            }
        }
        this.cache.set(key, result)
    }

    private startCacheCleanup(): void {
        // Clean up cache every 10 minutes
        safeSetInterval(() => {
            this.cache.clear()
            debugLog({ message: 'Title comparison cache cleared' })
        }, 600000)
    }

    clearCache(): void {
        this.cache.clear()
    }

    getCacheSize(): number {
        return this.cache.size
    }
}
