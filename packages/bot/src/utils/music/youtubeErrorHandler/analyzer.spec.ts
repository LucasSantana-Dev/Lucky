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
        // Each row covers one error category × one positive-match input (case
        // sensitivity is exercised by the case-insensitive row per category).
        // Negative matches are covered once at the bottom (one shared "Some
        // other error" check) — six identical "does not detect X" cases were
        // collapsed into one.
        it.each([
            ['parser', 'InnerTubeError: Invalid request', 'isParserError'],
            ['parser', 'ParsingError: Failed to parse response', 'isParserError'],
            ['parser (case-insensitive)', 'INNERTUBEERROR: test', 'isParserError'],
            ['composite video', 'CompositeVideoError: Video format not supported', 'isCompositeVideoError'],
            ['composite video (case-insensitive)', 'compositevideoERROR: test', 'isCompositeVideoError'],
            ['hype points', 'HypePoints: Unable to process hype points', 'isHypePointsError'],
            ['hype points (case-insensitive)', 'HYPEPOINTS: test', 'isHypePointsError'],
            ['type mismatch', 'TypeError: TypeMismatch in response', 'isTypeMismatchError'],
            ['type mismatch (case-insensitive)', 'TYPEMISMATCH: test', 'isTypeMismatchError'],
            ['grid shelf view', 'GridShelfView: Failed to render shelf', 'isGridShelfViewError'],
            ['grid shelf view (case-insensitive)', 'GRIDSHELFVIEW: test', 'isGridShelfViewError'],
            ['section header view', 'SectionHeaderView: Failed to render header', 'isSectionHeaderViewError'],
            ['section header view (case-insensitive)', 'SECTIONHEADERVIEW: test', 'isSectionHeaderViewError'],
        ] as const)('detects %s error from message %s', (_label, message, flag) => {
            const result = analyzer.analyzeError(new Error(message))
            expect(result[flag as keyof YouTubeErrorInfo]).toBe(true)
        })

        it('detects parser error from youtubei.js stack frame even with unrelated message', () => {
            const error = new Error('Failed to fetch')
            error.stack = 'Error: Failed to fetch\n    at youtubei.js:123:45'
            expect(analyzer.analyzeError(error).isParserError).toBe(true)
        })

        it('returns all-false flags for an unrelated error message', () => {
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

        it.each([
            ['timeout', 'Request timeout'],
            ['network', 'Network error occurred'],
            ['rate limit', 'Rate limit exceeded'],
            ['quota exceeded', 'Quota exceeded'],
        ])('marks %s error as retryable', (_label, message) => {
            expect(analyzer.analyzeError(new Error(message)).shouldRetry).toBe(true)
        })

        it('does not mark an unrelated error as retryable', () => {
            expect(analyzer.analyzeError(new Error('Invalid input')).shouldRetry).toBe(false)
        })

        it.each([
            ['signature', 'Signature verification failed'],
            ['cipher', 'Cipher decryption failed'],
            ['decrypt', 'Decrypt operation failed'],
        ])('marks %s error for retry-with-fallback', (_label, message) => {
            expect(analyzer.analyzeError(new Error(message)).retryWithFallback).toBe(true)
        })

        it('does not mark an unrelated error for retry-with-fallback', () => {
            expect(analyzer.analyzeError(new Error('Invalid input')).retryWithFallback).toBe(false)
        })

        it.each([
            ['undefined', undefined],
            ['empty', ''],
        ])('handles error with %s stack without throwing', (_label, stack) => {
            const error = new Error('Test error')
            error.stack = stack
            const result = analyzer.analyzeError(error)
            expect(result).toBeDefined()
            expect(result.isParserError).toBe(false)
        })

        it('detects multiple characteristics in one error and keeps unrelated flags false', () => {
            const result = analyzer.analyzeError(
                new Error('InnerTubeError: Network timeout'),
            )
            expect(result.isParserError).toBe(true)
            expect(result.shouldRetry).toBe(true)
            expect(result.isCompositeVideoError).toBe(false)
            expect(result.isHypePointsError).toBe(false)
        })
    })

    describe('getErrorResponse', () => {
        // Each row asserts the canonical response payload for a single error
        // category. Replaces six near-identical describes that built a full
        // YouTubeErrorInfo literal each time.
        it.each([
            [
                'parser',
                infoWith({ isParserError: true }),
                {
                    shouldRetry: true,
                    retryWithFallback: true,
                    userMessage: 'YouTube parser error, trying alternative method...',
                    logLevel: 'warn' as const,
                },
            ],
            [
                'composite video',
                infoWith({ isCompositeVideoError: true, shouldRetry: true, retryWithFallback: true }),
                {
                    shouldRetry: false,
                    retryWithFallback: false,
                    userMessage: 'Video format not supported',
                    logLevel: 'error' as const,
                },
            ],
            [
                'hype points',
                infoWith({ isHypePointsError: true }),
                {
                    shouldRetry: true,
                    retryWithFallback: false,
                    userMessage: 'YouTube hype points error, retrying...',
                    logLevel: 'warn' as const,
                },
            ],
            [
                'type mismatch',
                infoWith({ isTypeMismatchError: true }),
                {
                    shouldRetry: true,
                    retryWithFallback: true,
                    userMessage: 'YouTube type mismatch, trying alternative method...',
                    logLevel: 'warn' as const,
                },
            ],
            [
                'grid shelf view',
                infoWith({ isGridShelfViewError: true }),
                {
                    shouldRetry: true,
                    retryWithFallback: false,
                    userMessage: 'YouTube grid shelf error, retrying...',
                    logLevel: 'warn' as const,
                },
            ],
            [
                'section header view',
                infoWith({ isSectionHeaderViewError: true }),
                {
                    shouldRetry: true,
                    retryWithFallback: false,
                    userMessage: 'YouTube section header error, retrying...',
                    logLevel: 'warn' as const,
                },
            ],
        ] as const)('returns canonical response for %s error', (_label, info, expected) => {
            expect(analyzer.getErrorResponse(info, mockContext)).toEqual(expected)
        })

        it('returns the generic response and inherits flags when no specific category matches', () => {
            const info = infoWith({ shouldRetry: true, retryWithFallback: true })
            expect(analyzer.getErrorResponse(info, mockContext)).toEqual({
                shouldRetry: true,
                retryWithFallback: true,
                userMessage: 'YouTube error occurred',
                logLevel: 'error',
            })
        })

        it('preserves shouldRetry=false in the generic response', () => {
            const info = infoWith()
            expect(analyzer.getErrorResponse(info, mockContext).shouldRetry).toBe(false)
        })

        it('honours the documented priority order when several flags are set', () => {
            // Folds six "should prioritize X" describes into one assertion that
            // walks the full chain: parser > composite > hype > type-mismatch >
            // grid-shelf > section-header > generic.
            const allFlags: Array<keyof YouTubeErrorInfo> = [
                'isParserError',
                'isCompositeVideoError',
                'isHypePointsError',
                'isTypeMismatchError',
                'isGridShelfViewError',
                'isSectionHeaderViewError',
            ]
            const expectedMessage: Record<string, string> = {
                isParserError: 'YouTube parser error, trying alternative method...',
                isCompositeVideoError: 'Video format not supported',
                isHypePointsError: 'YouTube hype points error, retrying...',
                isTypeMismatchError: 'YouTube type mismatch, trying alternative method...',
                isGridShelfViewError: 'YouTube grid shelf error, retrying...',
                isSectionHeaderViewError: 'YouTube section header error, retrying...',
            }
            // For each priority slot, set that flag plus everything below and
            // assert the higher-priority message wins.
            for (let i = 0; i < allFlags.length; i++) {
                const overrides: Partial<YouTubeErrorInfo> = {}
                for (let j = i; j < allFlags.length; j++) overrides[allFlags[j]!] = true as never
                const info = infoWith(overrides)
                const response = analyzer.getErrorResponse(info, mockContext)
                expect(response.userMessage).toBe(expectedMessage[allFlags[i]!])
            }
        })

        it('handles context without guildId', () => {
            const contextWithoutGuild: YouTubeErrorContext = {
                query: 'test query',
                userId: 'user-123',
                timestamp: Date.now(),
            }
            expect(
                analyzer.getErrorResponse(infoWith(), contextWithoutGuild),
            ).toBeDefined()
        })
    })

    describe('integration: analyze then respond', () => {
        it.each([
            [
                'parser error',
                new Error('InnerTubeError: Invalid request'),
                {
                    flag: 'isParserError' as const,
                    userMessage: 'YouTube parser error, trying alternative method...',
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
