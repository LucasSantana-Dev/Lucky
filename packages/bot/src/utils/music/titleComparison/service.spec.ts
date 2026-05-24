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
            calculateSimilarityMock.mockReturnValue(0.75)
            const result = svc.isSimilarTitle('test1', 'test2')
            expect(result).toBe(true) // 0.75 >= 0.7
        })
    })

    describe('extractArtistTitle', () => {
        it.each([
            [
                'basic extraction',
                { artist: 'The Beatles', title: 'Hey Jude' },
                'The Beatles - Hey Jude',
                { artist: 'The Beatles', title: 'Hey Jude' },
            ],
            [
                'with whitespace',
                { artist: '  Artist  ', title: '  Title  ' },
                'Artist - Title',
                { artist: 'Artist', title: 'Title' },
            ],
            [
                'empty pattern result',
                { artist: '', title: '' },
                'Just Some Song',
                { artist: 'Unknown', title: 'Just Some Song' },
            ],
            [
                'missing artist fallback',
                { artist: '', title: 'Song Title' },
                'Song Title',
                { artist: 'Unknown', title: 'Song Title' },
            ],
        ])(
            'should handle %s',
            (_, mockReturnValue, input, expectedResult) => {
                applyPatternsMock.mockReturnValue(mockReturnValue)
                const result = service.extractArtistTitle(input)
                expect(result).toEqual(expectedResult)
            },
        )

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

        it('should maintain cache after adding items', () => {
            applyPatternsMock.mockReturnValue({
                artist: 'Artist',
                title: 'Title',
            })
            service.extractArtistTitle('Test')
            expect(service.getCacheSize()).toBe(1)
            service.extractArtistTitle('Another Song')
            expect(service.getCacheSize()).toBe(2)
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
        it.each([
            ['above threshold', 0.85, true],
            ['below threshold', 0.5, false],
            ['equals threshold', 0.8, true],
            ['perfect match', 1.0, true],
        ])('should handle similarity %s with score %s', (_, score, expected) => {
            calculateSimilarityMock.mockReturnValue(score)
            const result = service.isSimilarTitle('Title 1', 'Title 2')
            expect(result).toBe(expected)
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

        it.each([
            ['above threshold', 0.85, true, 0.85],
            ['below threshold', 0.5, false, 0.5],
            ['at threshold', 0.8, true, 0.8],
            ['zero score', 0, false, 0],
            ['perfect score', 1.0, true, 1.0],
        ])(
            'should mark as %s with score %s',
            (_, score, expectedSimilar, expectedScore) => {
                calculateSimilarityMock.mockReturnValue(score)
                const result = service.calculateSimilarity('Song A', 'Song B')
                expect(result.isSimilar).toBe(expectedSimilar)
                expect(result.score).toBe(expectedScore)
            },
        )

        it.each([
            [0.8, 1.0],
            [0.4, 0.5],
            [0.9, 1.0],
            [1.0, 1.0],
        ])(
            'should calculate confidence correctly with score %s',
            (score, expectedConfidence) => {
                calculateSimilarityMock.mockReturnValue(score)
                const result = service.calculateSimilarity('Title 1', 'Title 2')
                expect(result.confidence).toBeLessThanOrEqual(1.0)
                expect(result.confidence).toBe(expectedConfidence)
            },
        )
    })

    describe('cache management', () => {
        it('should limit cache size to maxCacheSize', () => {
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

        it('should remove oldest cache entry when maxCacheSize is reached', () => {
            applyPatternsMock.mockReturnValue({
                artist: 'Artist',
                title: 'Title',
            })
            const svc = new TitleComparisonService()
            svc.extractArtistTitle('song1')
            svc.extractArtistTitle('song2')
            expect(svc.getCacheSize()).toBe(2)
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

        it.each([
            [0, 0],
            [1, 1],
            [2, 2],
        ])(
            'should track cache size with %s items',
            (itemCount, expectedSize) => {
                applyPatternsMock.mockReturnValue({
                    artist: 'Artist',
                    title: 'Title',
                })
                for (let i = 0; i < itemCount; i++) {
                    service.extractArtistTitle(`Song ${i}`)
                }
                expect(service.getCacheSize()).toBe(expectedSize)
            },
        )

        it('should trigger cache cleanup on interval', () => {
            new TitleComparisonService()
            expect(safeSetIntervalMock).toHaveBeenCalledWith(
                expect.any(Function),
                600000,
            )
        })

        it('should log when cache is cleared by cleanup', () => {
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

        it.each([
            ["Don't Stop Believin'", 'Journey'],
            ['你好世界', 'Artist'],
            ['Song 🎵 Emoji', 'Artist'],
        ])(
            'should handle special characters: %s',
            (input, mockArtist) => {
                applyPatternsMock.mockReturnValue({
                    artist: mockArtist,
                    title: input,
                })
                const result = service.extractArtistTitle(input)
                expect(result.title).toBe(input)
            },
        )

        it.each([
            ['zero similarity', 0, false, 0],
            ['perfect similarity', 1.0, true, 1.0],
        ])(
            'should handle %s score',
            (_, score, expectedSimilar, expectedScore) => {
                calculateSimilarityMock.mockReturnValue(score)
                const result = service.calculateSimilarity('A', 'Z')
                expect(result.isSimilar).toBe(expectedSimilar)
                expect(result.score).toBe(expectedScore)
            },
        )
    })

    describe('error handling', () => {
        it.each([
            'Pattern matching failed',
            'Critical error',
        ])(
            'should handle extraction error: %s',
            (errorMsg) => {
                applyPatternsMock.mockImplementation(() => {
                    throw new Error(errorMsg)
                })
                const result = service.extractArtistTitle('Test')
                expect(errorLogMock).toHaveBeenCalledWith({
                    message: 'Error extracting artist/title:',
                    error: expect.any(Error),
                })
                expect(result.artist).toBe('Unknown')
            },
        )

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
