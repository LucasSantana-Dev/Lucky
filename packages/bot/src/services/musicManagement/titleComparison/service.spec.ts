const calculateSimilarityMock = jest.fn<number, [a: string, b: string]>()

jest.mock('../../../utils/misc/stringUtils', () => ({
    calculateSimilarity: (a: string, b: string) =>
        calculateSimilarityMock(a, b),
    normalizeString: (value: string) => value.replace(/\s+/g, ' ').trim(),
}))

import { TitleComparisonService } from './service'

describe('TitleComparisonService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('isSimilarTitle', () => {
        it('is true at or above the default threshold', () => {
            const service = new TitleComparisonService()
            calculateSimilarityMock.mockReturnValue(0.8)
            expect(service.isSimilarTitle('a', 'b')).toBe(true)
        })

        it('is false below the default threshold', () => {
            const service = new TitleComparisonService()
            calculateSimilarityMock.mockReturnValue(0.79)
            expect(service.isSimilarTitle('a', 'b')).toBe(false)
        })

        it('honours a custom threshold', () => {
            const service = new TitleComparisonService({ threshold: 0.5 })
            calculateSimilarityMock.mockReturnValue(0.6)
            expect(service.isSimilarTitle('a', 'b')).toBe(true)
        })
    })

    describe('calculateSimilarity', () => {
        it('reports the score, the verdict and a confidence capped at 1', () => {
            const service = new TitleComparisonService()
            calculateSimilarityMock.mockReturnValue(0.9)

            expect(service.calculateSimilarity('a', 'b')).toEqual({
                isSimilar: true,
                score: 0.9,
                confidence: 1,
            })
        })

        it('scales confidence against the threshold when below it', () => {
            const service = new TitleComparisonService()
            calculateSimilarityMock.mockReturnValue(0.4)

            const result = service.calculateSimilarity('a', 'b')

            expect(result.isSimilar).toBe(false)
            expect(result.confidence).toBeCloseTo(0.5)
        })
    })

    describe('title normalization', () => {
        it('lowercases and collapses whitespace by default', () => {
            const service = new TitleComparisonService()
            calculateSimilarityMock.mockReturnValue(1)

            service.isSimilarTitle('  Hello   World ', 'HELLO WORLD')

            expect(calculateSimilarityMock).toHaveBeenCalledWith(
                'hello world',
                'hello world',
            )
        })

        it('keeps case and whitespace when both options are off', () => {
            const service = new TitleComparisonService({
                caseSensitive: true,
                normalizeWhitespace: false,
            })
            calculateSimilarityMock.mockReturnValue(1)

            service.isSimilarTitle('Hello  World', 'HELLO WORLD')

            expect(calculateSimilarityMock).toHaveBeenCalledWith(
                'Hello  World',
                'HELLO WORLD',
            )
        })
    })
})
