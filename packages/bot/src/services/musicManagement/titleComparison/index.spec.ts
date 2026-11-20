import {
    TitleComparison,
    titleComparison,
    isSimilarTitle,
    calculateSimilarity,
} from './index'

describe('titleComparison barrel', () => {
    it('isSimilarTitle is true for a near-identical pair', () => {
        expect(isSimilarTitle('Bohemian Rhapsody', 'bohemian rhapsody')).toBe(
            true,
        )
    })

    it('isSimilarTitle is false for unrelated titles', () => {
        expect(isSimilarTitle('Bohemian Rhapsody', 'Garota de Ipanema')).toBe(
            false,
        )
    })

    it('calculateSimilarity reports a bounded score', () => {
        const result = calculateSimilarity('Hello', 'Hallo')
        expect(result.score).toBeGreaterThan(0)
        expect(result.score).toBeLessThanOrEqual(1)
        expect(result.confidence).toBeLessThanOrEqual(1)
    })

    it('free functions share the exported singleton', () => {
        expect(titleComparison.isSimilarTitle('Same', 'same')).toBe(
            isSimilarTitle('Same', 'same'),
        )
    })

    it('an instance honours a custom threshold', () => {
        const strict = new TitleComparison({ threshold: 0.99 })
        const loose = new TitleComparison({ threshold: 0.5 })

        expect(strict.isSimilarTitle('Hello', 'Hallo')).toBe(false)
        expect(loose.isSimilarTitle('Hello', 'Hallo')).toBe(true)
    })
})
