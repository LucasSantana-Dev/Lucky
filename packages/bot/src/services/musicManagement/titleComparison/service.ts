import {
    calculateSimilarity,
    normalizeString,
} from '../../../utils/misc/stringUtils'
import type { TitleComparisonOptions, SimilarityResult } from './types'

/**
 * Title comparison service
 */
export class TitleComparisonService {
    private readonly options: TitleComparisonOptions = {
        threshold: 0.8,
        caseSensitive: false,
        normalizeWhitespace: true,
    }

    constructor(options?: Partial<TitleComparisonOptions>) {
        if (options) {
            this.options = { ...this.options, ...options }
        }
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
}
