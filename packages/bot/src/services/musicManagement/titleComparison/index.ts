import { TitleComparisonService } from './service'
import type { TitleComparisonOptions, SimilarityResult } from './types'

/**
 * Main title comparison service
 */
export class TitleComparison {
    private readonly service: TitleComparisonService

    constructor(options?: Partial<TitleComparisonOptions>) {
        this.service = new TitleComparisonService(options)
    }

    isSimilarTitle(title1: string, title2: string): boolean {
        return this.service.isSimilarTitle(title1, title2)
    }

    calculateSimilarity(title1: string, title2: string): SimilarityResult {
        return this.service.calculateSimilarity(title1, title2)
    }
}

export const titleComparison = new TitleComparison()

export const isSimilarTitle = (title1: string, title2: string): boolean => {
    return titleComparison.isSimilarTitle(title1, title2)
}

export const calculateSimilarity = (
    title1: string,
    title2: string,
): SimilarityResult => {
    return titleComparison.calculateSimilarity(title1, title2)
}

export type { TitleComparisonOptions, SimilarityResult }
