import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { YouTubeErrorInfo, YouTubeErrorContext } from './types'
import { YouTubeErrorAnalyzer } from './analyzer'

// Build a fresh YouTubeErrorInfo with all flags false except the requested one.
// Used by the getErrorResponse describes so each scenario is one bool flip
// rather than a full literal repeat.
function infoWith(overrides: Partial<YouTubeErrorInfo> = {}): YouTubeErrorInfo {
    return {
        isParserError: false,
        isCompositeVideoError: false,
        isHypePointsError: false,
        isTypeMismatchError: false,
        isGridShelfViewError: false,
        isSectionHeaderViewError: false,
        shouldRetry: false,
        retryWithFallback: false,
        ...overrides,
    }
}

describe('YouTubeErrorAnalyzer', () => {
    let analyzer: YouTubeErrorAnalyzer
    let mockContext: YouTubeErrorContext

    beforeEach(() => {
        jest.clearAllMocks()
        analyzer = new YouTubeErrorAnalyzer()
        mockContext = {
            query: 'test query',
            userId: 'user-123',
            guildId: 'guild-123',
            timestamp: Date.now(),
        }
    })

    describe('analyzeError', () => {
        it.each([
            ['parser', 'InnerTubeError: Invalid request', 'isParserError'],
            [
                'composite video',
                'CompositeVideoError: Video format not supported',
                'isCompositeVideoError',
            ],
            [
                'hype points',
                'HypePoints: Unable to process hype points',
                'isHypePointsError',
            ],
            [
                'type mismatch',
                'TypeError: TypeMismatch in response',
                'isTypeMismatchError',
            ],
            [
                'grid shelf view',
                'GridShelfView: Failed to render shelf',
                'isGridShelfViewError',
            ],
            [
                'section header view',
                'SectionHeaderView: Failed to render header',
                'isSectionHeaderViewError',
            ],
        ] as const)('detects %s error', (_label, message, flag) => {
            const result = analyzer.analyzeError(new Error(message))
            expect(result[flag as keyof YouTubeErrorInfo]).toBe(true)
        })

        it('detects errors case-insensitively', () => {
            expect(
                analyzer.analyzeError(new Error('INNERTUBEERROR: test'))
                    .isParserError,
            ).toBe(true)
            expect(
                analyzer.analyzeError(new Error('compositevideoERROR: test'))
                    .isCompositeVideoError,
            ).toBe(true)
        })

        it('detects parser error from youtubei.js stack frame', () => {
            const error = new Error('Failed to fetch')
            error.stack = 'Error: Failed to fetch\n    at youtubei.js:123:45'
            expect(analyzer.analyzeError(error).isParserError).toBe(true)
        })

        it('returns all-false flags for unrelated error', () => {
            const result = analyzer.analyzeError(new Error('Some other error'))
            expect(result).toMatchObject({
                isParserError: false,
                isCompositeVideoError: false,
                isHypePointsError: false,
                isTypeMismatchError: false,
                isGridShelfViewError: false,
                isSectionHeaderViewError: false,
            })
        })

        it('marks timeout errors as retryable', () => {
            expect(
                analyzer.analyzeError(new Error('Request timeout')).shouldRetry,
            ).toBe(true)
        })

        it('does not mark unrelated errors as retryable', () => {
            expect(
                analyzer.analyzeError(new Error('Invalid input')).shouldRetry,
            ).toBe(false)
        })

        it('marks cipher errors for retry-with-fallback', () => {
            expect(
                analyzer.analyzeError(new Error('Cipher decryption failed'))
                    .retryWithFallback,
            ).toBe(true)
        })

        it('does not mark unrelated errors for retry-with-fallback', () => {
            expect(
                analyzer.analyzeError(new Error('Invalid input'))
                    .retryWithFallback,
            ).toBe(false)
        })
    })

    describe('getErrorResponse', () => {
        it.each([
            [
                'parser',
                infoWith({ isParserError: true }),
                'YouTube parser error, trying alternative method...',
            ],
            [
                'composite video',
                infoWith({ isCompositeVideoError: true }),
                'Video format not supported',
            ],
            [
                'hype points',
                infoWith({ isHypePointsError: true }),
                'YouTube hype points error, retrying...',
            ],
            [
                'type mismatch',
                infoWith({ isTypeMismatchError: true }),
                'YouTube type mismatch, trying alternative method...',
            ],
            [
                'grid shelf view',
                infoWith({ isGridShelfViewError: true }),
                'YouTube grid shelf error, retrying...',
            ],
            [
                'section header view',
                infoWith({ isSectionHeaderViewError: true }),
                'YouTube section header error, retrying...',
            ],
        ] as const)(
            'returns correct message for %s error',
            (_label, info, expectedMessage) => {
                const response = analyzer.getErrorResponse(info, mockContext)
                expect(response.userMessage).toBe(expectedMessage)
            },
        )

        it('returns generic response when no specific category matches', () => {
            const info = infoWith({ shouldRetry: true })
            const response = analyzer.getErrorResponse(info, mockContext)
            expect(response.userMessage).toBe('YouTube error occurred')
            expect(response.shouldRetry).toBe(true)
        })

        it('honours priority order: parser wins over composite over hype', () => {
            const info = infoWith({
                isParserError: true,
                isCompositeVideoError: true,
                isHypePointsError: true,
            })
            const response = analyzer.getErrorResponse(info, mockContext)
            expect(response.userMessage).toBe(
                'YouTube parser error, trying alternative method...',
            )
        })
    })

    describe('integration: analyze then respond', () => {
        it.each([
            [
                'parser error',
                new Error('InnerTubeError: Invalid request'),
                {
                    flag: 'isParserError' as const,
                    userMessage:
                        'YouTube parser error, trying alternative method...',
                    logLevel: 'warn' as const,
                },
            ],
            [
                'network timeout (retryable, no specific category)',
                new Error('Request timeout'),
                {
                    flag: 'shouldRetry' as const,
                    userMessage: 'YouTube error occurred',
                    logLevel: 'error' as const,
                },
            ],
            [
                'cipher failure (retry-with-fallback)',
                new Error('Cipher decryption failed'),
                {
                    flag: 'retryWithFallback' as const,
                    userMessage: 'YouTube error occurred',
                    logLevel: 'error' as const,
                },
            ],
            [
                'composite video error (terminal)',
                new Error('CompositeVideoError: Format not supported'),
                {
                    flag: 'isCompositeVideoError' as const,
                    userMessage: 'Video format not supported',
                    logLevel: 'error' as const,
                    extra: (resp: { shouldRetry: boolean }) =>
                        expect(resp.shouldRetry).toBe(false),
                },
            ],
        ] as const)(
            'analyzes %s and forwards to the right response',
            (_label, error, expected) => {
                const info = analyzer.analyzeError(error)
                expect(info[expected.flag]).toBe(true)
                const response = analyzer.getErrorResponse(info, mockContext)
                expect(response.userMessage).toBe(expected.userMessage)
                expect(response.logLevel).toBe(expected.logLevel)
                if ('extra' in expected && expected.extra)
                    (expected.extra as (r: typeof response) => void)(response)
            },
        )
    })
})
