import { TitleComparisonService } from './service'
import type {
    ArtistTitle,
    TitleComparisonOptions,
    SimilarityResult,
} from './types'

/**
 * Main title comparison service
 */
export class TitleComparison {
    private readonly service: TitleComparisonService

    constructor(options?: Partial<TitleComparisonOptions>) {
        this.service = new TitleComparisonService(options)
    }

    extractArtistTitle(input: string): ArtistTitle {
        return this.service.extractArtistTitle(input)
    }

    isSimilarTitle(title1: string, title2: string): boolean {
        return this.service.isSimilarTitle(title1, title2)
    }

    calculateSimilarity(title1: string, title2: string): SimilarityResult {
        return this.service.calculateSimilarity(title1, title2)
    }

    clearCache(): void {
        this.service.clearCache()
    }

    getCacheSize(): number {
        return this.service.getCacheSize()
    }
}

export const titleComparison = new TitleComparison()

export const extractArtistTitle = (input: string): ArtistTitle => {
    return titleComparison.extractArtistTitle(input)
}

export const isSimilarTitle = (title1: string, title2: string): boolean => {
    return titleComparison.isSimilarTitle(title1, title2)
}

export const calculateSimilarity = (
    title1: string,
    title2: string,
): SimilarityResult => {
    return titleComparison.calculateSimilarity(title1, title2)
}

export const clearCache = (): void => {
    titleComparison.clearCache()
}

export const getCacheSize = (): number => {
    return titleComparison.getCacheSize()
}

export type { ArtistTitle, TitleComparisonOptions, SimilarityResult }
