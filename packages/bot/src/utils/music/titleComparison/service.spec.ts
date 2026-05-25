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
        it('should extract and trim artist and title from input', () => {
            applyPatternsMock.mockReturnValue({
                artist: '  The Beatles  ',
                title: '  Hey Jude  ',
            })
            const result = service.extractArtistTitle('The Beatles - Hey Jude')
            expect(result).toEqual({
                artist: 'The Beatles',
                title: 'Hey Jude',
            })
        })

        it('should return Unknown artist when patterns do not match', () => {
            applyPatternsMock.mockReturnValue({ artist: '', title: '' })
            const result = service.extractArtistTitle('Just Some Song')
            expect(result).toEqual({
                artist: 'Unknown',
                title: 'Just Some Song',
            })
        })

        it('should cache extraction results by lowercase key (case-insensitive)', () => {
            applyPatternsMock.mockReturnValue({
                artist: 'Artist',
                title: 'Title',
            })
            const result1 = service.extractArtistTitle('ARTIST - TITLE')
            applyPatternsMock.mockClear()
            const result2 = service.extractArtistTitle('artist - title')
            expect(applyPatternsMock).not.toHaveBeenCalled()
            expect(result1).toEqual(result2)
            expect(service.getCacheSize()).toBe(1)
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
    })

    describe('isSimilarTitle', () => {
        it('should return true when similarity is above or equal to threshold', () => {
            calculateSimilarityMock.mockReturnValue(0.8)
            expect(service.isSimilarTitle('A', 'B')).toBe(true)

            calculateSimilarityMock.mockReturnValue(0.85)
            expect(service.isSimilarTitle('Hey Jude', 'Hey Jude')).toBe(true)
        })

        it('should return false when similarity is below threshold', () => {
            calculateSimilarityMock.mockReturnValue(0.5)
            const result = service.isSimilarTitle('Song A', 'Song B')
            expect(result).toBe(false)
        })
    })

    describe('calculateSimilarity', () => {
        it('should return result with isSimilar, score, and confidence properties', () => {
            calculateSimilarityMock.mockReturnValue(0.85)
            const result = service.calculateSimilarity('Title 1', 'Title 2')
            expect(result).toHaveProperty('isSimilar')
            expect(result).toHaveProperty('score')
            expect(result).toHaveProperty('confidence')
        })

        it('should mark as similar/dissimilar and return correct score', () => {
            calculateSimilarityMock.mockReturnValue(0.85)
            const similar = service.calculateSimilarity('Song', 'Song')
            expect(similar.isSimilar).toBe(true)
            expect(similar.score).toBe(0.85)

            calculateSimilarityMock.mockReturnValue(0.5)
            const dissimilar = service.calculateSimilarity('Song A', 'Song B')
            expect(dissimilar.isSimilar).toBe(false)
            expect(dissimilar.score).toBe(0.5)
        })

        it('should calculate and cap confidence at 1.0', () => {
            calculateSimilarityMock.mockReturnValue(0.8)
            const result1 = service.calculateSimilarity('Title 1', 'Title 2')
            expect(result1.confidence).toBe(1.0) // 0.8 / 0.8 = 1.0

            calculateSimilarityMock.mockReturnValue(0.9)
            const result2 = service.calculateSimilarity('Title 1', 'Title 2')
            expect(result2.confidence).toBe(1.0) // 0.9 / 0.8 = 1.125, capped to 1.0

            calculateSimilarityMock.mockReturnValue(0.4)
            const result3 = service.calculateSimilarity('Title A', 'Title B')
            expect(result3.confidence).toBe(0.5) // 0.4 / 0.8 = 0.5
        })
    })

    describe('cache management', () => {
        it('should limit cache size to maxCacheSize and evict oldest entries', () => {
            applyPatternsMock.mockReturnValue({
                artist: 'Artist',
                title: 'Title',
            })
            const svc = new TitleComparisonService()
            for (let i = 0; i < 1001; i++) {
                svc.extractArtistTitle(`Song ${i}`)
            }
            expect(svc.getCacheSize()).toBeLessThanOrEqual(1000)
        })

        it('should clear and repopulate cache', () => {
            applyPatternsMock.mockReturnValue({
                artist: 'Artist',
                title: 'Title',
            })
            service.extractArtistTitle('Test Song')
            expect(service.getCacheSize()).toBe(1)
            service.clearCache()
            expect(service.getCacheSize()).toBe(0)
            service.extractArtistTitle('Another Song')
            expect(service.getCacheSize()).toBe(1)
        })

        it('should set up cache cleanup interval with logging', () => {
            const svc = new TitleComparisonService()
            expect(safeSetIntervalMock).toHaveBeenCalledWith(
                expect.any(Function),
                600000,
            )
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
        it('should handle empty and special character input', () => {
            applyPatternsMock.mockReturnValue({ artist: '', title: '' })
            const empty = service.extractArtistTitle('')
            expect(empty.artist).toBe('Unknown')
            expect(empty.title).toBe('')

            const longString = 'A'.repeat(10000)
            applyPatternsMock.mockReturnValue({
                artist: 'Artist',
                title: longString,
            })
            const long = service.extractArtistTitle(longString)
            expect(long.title).toBe(longString)
        })

        it('should handle unicode and emoji characters', () => {
            applyPatternsMock.mockReturnValue({
                artist: 'Artist',
                title: '你好世界',
            })
            const unicode = service.extractArtistTitle('你好世界')
            expect(unicode.title).toBe('你好世界')

            applyPatternsMock.mockReturnValue({
                artist: 'Artist',
                title: 'Song 🎵 With 🎶 Emoji',
            })
            const emoji = service.extractArtistTitle('Song 🎵 With 🎶 Emoji')
            expect(emoji.title).toBe('Song 🎵 With 🎶 Emoji')
        })

        it('should handle zero and perfect similarity scores', () => {
            calculateSimilarityMock.mockReturnValue(0)
            const zero = service.calculateSimilarity('A', 'Z')
            expect(zero.isSimilar).toBe(false)
            expect(zero.score).toBe(0)
            expect(zero.confidence).toBe(0)

            calculateSimilarityMock.mockReturnValue(1.0)
            const perfect = service.calculateSimilarity('Same', 'Same')
            expect(perfect.isSimilar).toBe(true)
            expect(perfect.score).toBe(1.0)
            expect(perfect.confidence).toBeLessThanOrEqual(1.0)
        })
    })

    describe('error handling', () => {
        it('should catch and log extraction errors gracefully', () => {
            applyPatternsMock.mockImplementation(() => {
                throw new Error('Pattern matching failed')
            })
            expect(() => {
                service.extractArtistTitle('Test')
            }).not.toThrow()

            const result = service.extractArtistTitle('My Special Song')
            expect(errorLogMock).toHaveBeenCalledWith({
                message: 'Error extracting artist/title:',
                error: expect.any(Error),
            })
            expect(result.artist).toBe('Unknown')
            expect(result.title).toBe('My Special Song')
        })
    })
})
