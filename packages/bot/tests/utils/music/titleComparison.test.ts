import { TitleComparisonService } from '../../../src/services/musicManagement/titleComparison/service'

describe('TitleComparisonService', () => {
    let service: TitleComparisonService

    beforeEach(() => {
        service = new TitleComparisonService()
    })

    describe('isSimilarTitle', () => {
        it('returns true for identical titles', () => {
            expect(
                service.isSimilarTitle(
                    'Bohemian Rhapsody',
                    'Bohemian Rhapsody',
                ),
            ).toBe(true)
        })

        it('returns true for case-different titles', () => {
            expect(
                service.isSimilarTitle(
                    'bohemian rhapsody',
                    'BOHEMIAN RHAPSODY',
                ),
            ).toBe(true)
        })

        it('returns false for very different titles', () => {
            expect(
                service.isSimilarTitle(
                    'Bohemian Rhapsody',
                    'Stairway to Heaven',
                ),
            ).toBe(false)
        })

        it('returns true for slightly different titles', () => {
            expect(
                service.isSimilarTitle(
                    'Bohemian Rhapsody Queen',
                    'Bohemian Rhapsody Queen!',
                ),
            ).toBe(true)
        })
    })

    describe('calculateSimilarity', () => {
        it('returns score of 1 for identical titles', () => {
            const result = service.calculateSimilarity('Test', 'Test')
            expect(result.score).toBe(1)
            expect(result.isSimilar).toBe(true)
            expect(result.confidence).toBe(1)
        })

        it('returns low score for different titles', () => {
            const result = service.calculateSimilarity('ABCDEFGH', 'ZYXWVUTS')
            expect(result.score).toBeLessThan(0.5)
            expect(result.isSimilar).toBe(false)
        })
    })

    describe('custom options', () => {
        it('uses custom threshold', () => {
            const strict = new TitleComparisonService({ threshold: 0.95 })
            expect(strict.isSimilarTitle('Hello World', 'Hello Worlds')).toBe(
                false,
            )
        })

        it('respects caseSensitive option', () => {
            const caseSensitive = new TitleComparisonService({
                caseSensitive: true,
            })
            const result = caseSensitive.calculateSimilarity('Hello', 'hello')
            expect(result.score).toBeLessThan(1)
        })
    })
})
