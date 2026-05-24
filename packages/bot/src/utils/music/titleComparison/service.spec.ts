import { beforeEach, describe, expect, it, jest } from '@jest/globals'

// Mock dependencies
const debugLogMock = jest.fn()
const errorLogMock = jest.fn()
const safeSetIntervalMock = jest.fn()
const calculateSimilarityMock = jest.fn()
const normalizeStringMock = jest.fn()
const applyPatternsMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
    safeSetInterval: (...args: unknown[]) => safeSetIntervalMock(...args),
}))

jest.mock('@lucky/shared/config', () => ({
    artistTitlePatterns: [],
    youtubePatterns: [],
    artistPatterns: [],
}))

jest.mock('../../misc/stringUtils', () => ({
    applyPatterns: (...args: unknown[]) => applyPatternsMock(...args),
    calculateSimilarity: (...args: unknown[]) =>
        calculateSimilarityMock(...args),
    normalizeString: (...args: unknown[]) => normalizeStringMock(...args),
}))

import { TitleComparisonService } from './service'

describe('TitleComparisonService', () => {
    let service: TitleComparisonService

    beforeEach(() => {
        jest.clearAllMocks()
        service = new TitleComparisonService()
        // Reset mock implementations
        normalizeStringMock.mockImplementation((str: string) =>
            str.replace(/\s+/g, ' ').trim(),
        )
    })

    describe('constructor', () => {
        it('should merge custom options and use custom threshold', () => {
            const customOptions = { threshold: 0.7 }
            const svc = new TitleComparisonService(customOptions)
            // The service should use threshold 0.7
            calculateSimilarityMock.mockReturnValue(0.75)
            const result = svc.isSimilarTitle('test1', 'test2')
            expect(result).toBe(true) // 0.75 >= 0.7
        })
    })

    describe('extractArtistTitle', () => {
        it('should extract artist and title from input', () => {
            applyPatternsMock.mockReturnValue({
                artist: 'The Beatles',
                title: 'Hey Jude',
            })
            const result = service.extractArtistTitle('The Beatles - Hey Jude')
            expect(result).toEqual({
                artist: 'The Beatles',
                title: 'Hey Jude',
            })
        })

        it('should trim whitespace from extracted artist and title', () => {
            applyPatternsMock.mockReturnValue({
                artist: '  Artist  ',
                title: '  Title  ',
            })
            const result = service.extractArtistTitle('Artist - Title')
            expect(result).toEqual({
                artist: 'Artist',
                title: 'Title',
            })
        })

        it('should return Unknown as artist when patterns do not match', () => {
            applyPatternsMock.mockReturnValue({ artist: '', title: '' })
            const result = service.extractArtistTitle('Just Some Song')
            expect(result).toEqual({
                artist: 'Unknown',
                title: 'Just Some Song',
            })
        })

        it('should fallback to Unknown artist when only title is extracted', () => {
            applyPatternsMock.mockReturnValue({
                artist: '',
                title: 'Song Title',
            })
            const result = service.extractArtistTitle('Song Title')
            expect(result).toEqual({
                artist: 'Unknown',
                title: 'Song Title',
            })
        })

        it('should cache extraction results by lowercase key', () => {
            applyPatternsMock.mockReturnValue({
                artist: 'Artist',
                title: 'Title',
            })
            const result1 = service.extractArtistTitle('ARTIST - TITLE')
            applyPatternsMock.mockClear()
            const result2 = service.extractArtistTitle('artist - title')
            expect(applyPatternsMock).not.toHaveBeenCalled()
            expect(result1).toEqual(result2)
        })

        it('should handle extraction errors gracefully', () => {
            applyPatternsMock.mockImplementation(() => {
                throw new Error('Pattern error')
            })
            const result = service.extractArtistTitle('Test Input')
            expect(result).toEqual({
                artist: 'Unknown',
                title: 'Test Input',
            })
            expect(errorLogMock).toHaveBeenCalledWith({
                message: 'Error extracting artist/title:',
                error: expect.any(Error),
            })
        })

        it('should handle null/undefined in pattern result', () => {
            applyPatternsMock.mockReturnValue({ artist: null, title: null })
            const result = service.extractArtistTitle('Input')
            expect(result).toEqual({
                artist: 'Unknown',
                title: 'Input',
            })
        })

        it('should cache the extraction result', () => {
            applyPatternsMock.mockReturnValue({
                artist: 'Artist',
                title: 'Title',
            })
            service.extractArtistTitle('Test')
            expect(service.getCacheSize()).toBe(1)
        })

        it('should case-insensitively check cache', () => {
            applyPatternsMock.mockReturnValue({
                artist: 'Artist',
                title: 'Title',
            })
            const result1 = service.extractArtistTitle('Test')
            applyPatternsMock.mockClear()
            const result2 = service.extractArtistTitle('TEST')
            expect(applyPatternsMock).not.toHaveBeenCalled()
            expect(result2).toEqual(result1)
        })
    })

    describe('isSimilarTitle', () => {
        it('should return true when similarity is above threshold', () => {
            calculateSimilarityMock.mockReturnValue(0.85)
            const result = service.isSimilarTitle('Hey Jude', 'Hey Jude')
            expect(result).toBe(true)
        })

        it('should return false when similarity is below threshold', () => {
            calculateSimilarityMock.mockReturnValue(0.5)
            const result = service.isSimilarTitle('Song A', 'Song B')
            expect(result).toBe(false)
        })

        it('should return true when similarity equals threshold', () => {
            calculateSimilarityMock.mockReturnValue(0.8)
            const result = service.isSimilarTitle('Title 1', 'Title 2')
            expect(result).toBe(true)
        })

        it('should compare identical titles as similar', () => {
            normalizeStringMock.mockImplementation((str: string) => str)
            calculateSimilarityMock.mockReturnValue(1.0)
            const result = service.isSimilarTitle(
                'Perfect Match',
                'Perfect Match',
            )
            expect(result).toBe(true)
        })
    })

    describe('calculateSimilarity', () => {
        it('should return similarity result with correct structure', () => {
            calculateSimilarityMock.mockReturnValue(0.85)
            const result = service.calculateSimilarity('Title 1', 'Title 2')
            expect(result).toHaveProperty('isSimilar')
            expect(result).toHaveProperty('score')
            expect(result).toHaveProperty('confidence')
        })

        it('should mark as similar when score is above threshold', () => {
            calculateSimilarityMock.mockReturnValue(0.85)
            const result = service.calculateSimilarity('Song', 'Song')
            expect(result.isSimilar).toBe(true)
        })

        it('should mark as not similar when score is below threshold', () => {
            calculateSimilarityMock.mockReturnValue(0.5)
            const result = service.calculateSimilarity('Song A', 'Song B')
            expect(result.isSimilar).toBe(false)
        })

        it('should return the correct similarity score', () => {
            calculateSimilarityMock.mockReturnValue(0.75)
            const result = service.calculateSimilarity('Title 1', 'Title 2')
            expect(result.score).toBe(0.75)
        })

        it('should calculate confidence as score/threshold', () => {
            calculateSimilarityMock.mockReturnValue(0.8)
            const result = service.calculateSimilarity('Title 1', 'Title 2')
            expect(result.confidence).toBe(1.0) // 0.8 / 0.8 = 1.0
        })

        it('should cap confidence at 1.0', () => {
            calculateSimilarityMock.mockReturnValue(1.0)
            const result = service.calculateSimilarity('Title 1', 'Title 2')
            expect(result.confidence).toBeLessThanOrEqual(1.0)
        })

        it('should cap confidence at 1.0 even when score exceeds threshold', () => {
            calculateSimilarityMock.mockReturnValue(0.9)
            const result = service.calculateSimilarity('Title 1', 'Title 2')
            expect(result.confidence).toBe(1.0) // 0.9 / 0.8 = 1.125, capped to 1.0 via Math.min
        })

        it('should handle low scores with low confidence', () => {
            calculateSimilarityMock.mockReturnValue(0.4)
            const result = service.calculateSimilarity('Title A', 'Title B')
            expect(result.confidence).toBe(0.5) // 0.4 / 0.8 = 0.5
        })
    })

    describe('cache management', () => {
        it('should limit cache size to maxCacheSize', () => {
            applyPatternsMock.mockReturnValue({
                artist: 'Artist',
                title: 'Title',
            })
            // Create a new service and manually add 1001 items to test eviction
            const svc = new TitleComparisonService()
            // Add 1001 items
            for (let i = 0; i < 1001; i++) {
                svc.extractArtistTitle(`Song ${i}`)
            }
            expect(svc.getCacheSize()).toBeLessThanOrEqual(1000)
        })

        it('should remove oldest cache entry when maxCacheSize is reached', () => {
            applyPatternsMock.mockReturnValue({
                artist: 'Artist',
                title: 'Title',
            })
            const svc = new TitleComparisonService()
            svc.extractArtistTitle('song1')
            svc.extractArtistTitle('song2')
            expect(svc.getCacheSize()).toBe(2)
            // Add 1000 more to trigger eviction
            for (let i = 2; i <= 1001; i++) {
                svc.extractArtistTitle(`song${i}`)
            }
            expect(svc.getCacheSize()).toBe(1000)
        })

        it('should clear cache on clearCache()', () => {
            applyPatternsMock.mockReturnValue({
                artist: 'Artist',
                title: 'Title',
            })
            service.extractArtistTitle('Test Song')
            expect(service.getCacheSize()).toBe(1)
            service.clearCache()
            expect(service.getCacheSize()).toBe(0)
        })

        it('should repopulate cache after clearing', () => {
            applyPatternsMock.mockReturnValue({
                artist: 'Artist',
                title: 'Title',
            })
            service.extractArtistTitle('Test Song')
            service.clearCache()
            service.extractArtistTitle('Another Song')
            expect(service.getCacheSize()).toBe(1)
        })

        it('should return correct cache size', () => {
            applyPatternsMock.mockReturnValue({
                artist: 'Artist',
                title: 'Title',
            })
            expect(service.getCacheSize()).toBe(0)
            service.extractArtistTitle('Song 1')
            expect(service.getCacheSize()).toBe(1)
            service.extractArtistTitle('Song 2')
            expect(service.getCacheSize()).toBe(2)
        })

        it('should trigger cache cleanup on interval', () => {
            new TitleComparisonService()
            expect(safeSetIntervalMock).toHaveBeenCalledWith(
                expect.any(Function),
                600000,
            )
        })

        it('should log when cache is cleared by cleanup', () => {
            // Get the cleanup callback
            const svc = new TitleComparisonService()
            const cleanupCallback = safeSetIntervalMock.mock
                .calls[0][0] as () => void
            cleanupCallback()
            expect(debugLogMock).toHaveBeenCalledWith({
                message: 'Title comparison cache cleared',
            })
        })
    })

    describe('title normalization', () => {
        it('should handle case sensitivity option and whitespace normalization', () => {
            const svc = new TitleComparisonService({
                caseSensitive: false,
                normalizeWhitespace: true,
            })
            normalizeStringMock.mockImplementation((str: string) =>
                str.toLowerCase().replace(/\s+/g, ' ').trim(),
            )
            calculateSimilarityMock.mockReturnValue(0.85)
            const result = svc.isSimilarTitle('  HEY  JUDE  ', 'hey jude')
            expect(result).toBe(true)
        })
    })

    describe('integration scenarios', () => {
        it('should handle full workflow: extract, compare, get cache size', () => {
            applyPatternsMock.mockReturnValue({
                artist: 'Beatles',
                title: 'Hey Jude',
            })
            normalizeStringMock.mockImplementation((str: string) =>
                str.toLowerCase().trim(),
            )
            calculateSimilarityMock.mockReturnValue(0.9)

            const extracted = service.extractArtistTitle(
                'The Beatles - Hey Jude',
            )
            expect(extracted.artist).toBe('Beatles')
            expect(extracted.title).toBe('Hey Jude')

            const similar = service.isSimilarTitle('Hey Jude', 'hey jude')
            expect(similar).toBe(true)

            const similarity = service.calculateSimilarity(
                'Hey Jude',
                'hey jude',
            )
            expect(similarity.isSimilar).toBe(true)
            expect(similarity.score).toBe(0.9)

            expect(service.getCacheSize()).toBe(1)
        })

        it('should handle multiple services with separate caches', () => {
            applyPatternsMock.mockReturnValue({
                artist: 'Artist',
                title: 'Title',
            })
            const svc1 = new TitleComparisonService()
            const svc2 = new TitleComparisonService()

            svc1.extractArtistTitle('Song 1')
            expect(svc1.getCacheSize()).toBe(1)
            expect(svc2.getCacheSize()).toBe(0)
        })

        it('should maintain separate options per instance', () => {
            const svc1 = new TitleComparisonService({ threshold: 0.7 })
            const svc2 = new TitleComparisonService({ threshold: 0.9 })

            normalizeStringMock.mockImplementation((str: string) => str)
            calculateSimilarityMock.mockReturnValue(0.75)

            const result1 = svc1.isSimilarTitle('A', 'B')
            const result2 = svc2.isSimilarTitle('A', 'B')

            expect(result1).toBe(true) // 0.75 >= 0.7
            expect(result2).toBe(false) // 0.75 < 0.9
        })
    })

    describe('edge cases', () => {
        it('should handle empty string input', () => {
            applyPatternsMock.mockReturnValue({ artist: '', title: '' })
            const result = service.extractArtistTitle('')
            expect(result.artist).toBe('Unknown')
            expect(result.title).toBe('')
        })

        it('should handle very long input strings', () => {
            const longString = 'A'.repeat(10000)
            applyPatternsMock.mockReturnValue({
                artist: 'Artist',
                title: longString,
            })
            const result = service.extractArtistTitle(longString)
            expect(result.title).toBe(longString)
        })

        it('should handle special characters in titles', () => {
            const specialTitle = "Don't Stop Believin' (ft. featuring) [Remix]"
            applyPatternsMock.mockReturnValue({
                artist: 'Journey',
                title: specialTitle,
            })
            const result = service.extractArtistTitle(specialTitle)
            expect(result.title).toBe(specialTitle)
        })

        it('should handle unicode characters', () => {
            const unicodeTitle = '你好世界'
            applyPatternsMock.mockReturnValue({
                artist: 'Artist',
                title: unicodeTitle,
            })
            const result = service.extractArtistTitle(unicodeTitle)
            expect(result.title).toBe(unicodeTitle)
        })

        it('should handle emoji in titles', () => {
            const emojiTitle = 'Song 🎵 With 🎶 Emoji'
            applyPatternsMock.mockReturnValue({
                artist: 'Artist',
                title: emojiTitle,
            })
            const result = service.extractArtistTitle(emojiTitle)
            expect(result.title).toBe(emojiTitle)
        })

        it('should handle zero similarity score', () => {
            calculateSimilarityMock.mockReturnValue(0)
            const result = service.calculateSimilarity('A', 'Z')
            expect(result.isSimilar).toBe(false)
            expect(result.score).toBe(0)
            expect(result.confidence).toBe(0)
        })

        it('should handle perfect similarity score', () => {
            calculateSimilarityMock.mockReturnValue(1.0)
            const result = service.calculateSimilarity('Same', 'Same')
            expect(result.isSimilar).toBe(true)
            expect(result.score).toBe(1.0)
            expect(result.confidence).toBeLessThanOrEqual(1.0)
        })
    })

    describe('error handling', () => {
        it('should catch and log extraction errors', () => {
            applyPatternsMock.mockImplementation(() => {
                throw new Error('Pattern matching failed')
            })
            const result = service.extractArtistTitle('Test')
            expect(errorLogMock).toHaveBeenCalledWith({
                message: 'Error extracting artist/title:',
                error: expect.any(Error),
            })
            expect(result.artist).toBe('Unknown')
        })

        it('should not throw on extraction error', () => {
            applyPatternsMock.mockImplementation(() => {
                throw new Error('Critical error')
            })
            expect(() => {
                service.extractArtistTitle('Test')
            }).not.toThrow()
        })

        it('should preserve input when extraction fails', () => {
            const input = 'My Special Song'
            applyPatternsMock.mockImplementation(() => {
                throw new Error('Error')
            })
            const result = service.extractArtistTitle(input)
            expect(result.title).toBe(input)
        })
    })
})
