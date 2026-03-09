jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    safeSetInterval: jest.fn(),
}))

jest.mock('@lucky/shared/config', () => ({
    artistTitlePatterns: [],
    youtubePatterns: [],
    artistPatterns: [],
}))

import { TitleComparisonService } from '../../../src/utils/music/titleComparison/service'

describe('TitleComparisonService', () => {
    let service: TitleComparisonService

    beforeEach(() => {
        service = new TitleComparisonService()
    })

    describe('extractArtistTitle', () => {
        it('returns Unknown artist for plain input', () => {
            const result = service.extractArtistTitle('Some Song Title')
            expect(result.title).toBe('Some Song Title')
            expect(result.artist).toBe('Unknown')
        })

        it('caches results for repeated queries', () => {
            const result1 = service.extractArtistTitle('Test Song')
            const result2 = service.extractArtistTitle('Test Song')
            expect(result1).toEqual(result2)
            expect(service.getCacheSize()).toBe(1)
        })

        it('is case insensitive for caching', () => {
            service.extractArtistTitle('Test Song')
            service.extractArtistTitle('test song')
            expect(service.getCacheSize()).toBe(1)
        })
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

    describe('cache management', () => {
        it('clearCache empties the cache', () => {
            service.extractArtistTitle('Song 1')
            service.extractArtistTitle('Song 2')
            expect(service.getCacheSize()).toBe(2)

            service.clearCache()
            expect(service.getCacheSize()).toBe(0)
        })

        it('evicts oldest entry when cache is full', () => {
            const svc = new TitleComparisonService()
            for (let i = 0; i < 1001; i++) {
                svc.extractArtistTitle(`Song ${i}`)
            }
            expect(svc.getCacheSize()).toBe(1000)
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
