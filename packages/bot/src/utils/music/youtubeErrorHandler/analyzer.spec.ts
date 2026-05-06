import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { YouTubeErrorInfo, YouTubeErrorContext, YouTubeErrorResponse } from './types'
import { YouTubeErrorAnalyzer } from './analyzer'

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
        describe('parser error detection', () => {
            it('should detect parser error with innertubeerror message', () => {
                const error = new Error('InnerTubeError: Invalid request')
                const result = analyzer.analyzeError(error)

                expect(result.isParserError).toBe(true)
            })

            it('should detect parser error with parsingerror message', () => {
                const error = new Error('ParsingError: Failed to parse response')
                const result = analyzer.analyzeError(error)

                expect(result.isParserError).toBe(true)
            })

            it('should detect parser error with youtubei.js in stack', () => {
                const error = new Error('Failed to fetch')
                error.stack = 'Error: Failed to fetch\n    at youtubei.js:123:45'
                const result = analyzer.analyzeError(error)

                expect(result.isParserError).toBe(true)
            })

            it('should be case-insensitive for parser error detection', () => {
                const error = new Error('INNERTUBEERROR: test')
                const result = analyzer.analyzeError(error)

                expect(result.isParserError).toBe(true)
            })

            it('should not detect parser error when error does not match', () => {
                const error = new Error('Some other error')
                const result = analyzer.analyzeError(error)

                expect(result.isParserError).toBe(false)
            })
        })

        describe('composite video error detection', () => {
            it('should detect composite video error', () => {
                const error = new Error('CompositeVideoError: Video format not supported')
                const result = analyzer.analyzeError(error)

                expect(result.isCompositeVideoError).toBe(true)
            })

            it('should be case-insensitive for composite video error detection', () => {
                const error = new Error('compositevideoERROR: test')
                const result = analyzer.analyzeError(error)

                expect(result.isCompositeVideoError).toBe(true)
            })

            it('should not detect composite video error when error does not match', () => {
                const error = new Error('Some other error')
                const result = analyzer.analyzeError(error)

                expect(result.isCompositeVideoError).toBe(false)
            })
        })

        describe('hype points error detection', () => {
            it('should detect hype points error', () => {
                const error = new Error('HypePoints: Unable to process hype points')
                const result = analyzer.analyzeError(error)

                expect(result.isHypePointsError).toBe(true)
            })

            it('should be case-insensitive for hype points error detection', () => {
                const error = new Error('HYPEPOINTS: test')
                const result = analyzer.analyzeError(error)

                expect(result.isHypePointsError).toBe(true)
            })

            it('should not detect hype points error when error does not match', () => {
                const error = new Error('Some other error')
                const result = analyzer.analyzeError(error)

                expect(result.isHypePointsError).toBe(false)
            })
        })

        describe('type mismatch error detection', () => {
            it('should detect type mismatch error', () => {
                const error = new Error('TypeError: TypeMismatch in response')
                const result = analyzer.analyzeError(error)

                expect(result.isTypeMismatchError).toBe(true)
            })

            it('should be case-insensitive for type mismatch error detection', () => {
                const error = new Error('TYPEMISMATCH: test')
                const result = analyzer.analyzeError(error)

                expect(result.isTypeMismatchError).toBe(true)
            })

            it('should not detect type mismatch error when error does not match', () => {
                const error = new Error('Some other error')
                const result = analyzer.analyzeError(error)

                expect(result.isTypeMismatchError).toBe(false)
            })
        })

        describe('grid shelf view error detection', () => {
            it('should detect grid shelf view error', () => {
                const error = new Error('GridShelfView: Failed to render shelf')
                const result = analyzer.analyzeError(error)

                expect(result.isGridShelfViewError).toBe(true)
            })

            it('should be case-insensitive for grid shelf view error detection', () => {
                const error = new Error('GRIDSHELFVIEW: test')
                const result = analyzer.analyzeError(error)

                expect(result.isGridShelfViewError).toBe(true)
            })

            it('should not detect grid shelf view error when error does not match', () => {
                const error = new Error('Some other error')
                const result = analyzer.analyzeError(error)

                expect(result.isGridShelfViewError).toBe(false)
            })
        })

        describe('section header view error detection', () => {
            it('should detect section header view error', () => {
                const error = new Error('SectionHeaderView: Failed to render header')
                const result = analyzer.analyzeError(error)

                expect(result.isSectionHeaderViewError).toBe(true)
            })

            it('should be case-insensitive for section header view error detection', () => {
                const error = new Error('SECTIONHEADERVIEW: test')
                const result = analyzer.analyzeError(error)

                expect(result.isSectionHeaderViewError).toBe(true)
            })

            it('should not detect section header view error when error does not match', () => {
                const error = new Error('Some other error')
                const result = analyzer.analyzeError(error)

                expect(result.isSectionHeaderViewError).toBe(false)
            })
        })

        describe('retry logic', () => {
            it('should set shouldRetry true for timeout error', () => {
                const error = new Error('Request timeout')
                const result = analyzer.analyzeError(error)

                expect(result.shouldRetry).toBe(true)
            })

            it('should set shouldRetry true for network error', () => {
                const error = new Error('Network error occurred')
                const result = analyzer.analyzeError(error)

                expect(result.shouldRetry).toBe(true)
            })

            it('should set shouldRetry true for rate limit error', () => {
                const error = new Error('Rate limit exceeded')
                const result = analyzer.analyzeError(error)

                expect(result.shouldRetry).toBe(true)
            })

            it('should set shouldRetry true for quota exceeded error', () => {
                const error = new Error('Quota exceeded')
                const result = analyzer.analyzeError(error)

                expect(result.shouldRetry).toBe(true)
            })

            it('should set shouldRetry false for non-retryable error', () => {
                const error = new Error('Invalid input')
                const result = analyzer.analyzeError(error)

                expect(result.shouldRetry).toBe(false)
            })
        })

        describe('retry with fallback logic', () => {
            it('should set retryWithFallback true for signature error', () => {
                const error = new Error('Signature verification failed')
                const result = analyzer.analyzeError(error)

                expect(result.retryWithFallback).toBe(true)
            })

            it('should set retryWithFallback true for cipher error', () => {
                const error = new Error('Cipher decryption failed')
                const result = analyzer.analyzeError(error)

                expect(result.retryWithFallback).toBe(true)
            })

            it('should set retryWithFallback true for decrypt error', () => {
                const error = new Error('Decrypt operation failed')
                const result = analyzer.analyzeError(error)

                expect(result.retryWithFallback).toBe(true)
            })

            it('should set retryWithFallback false for non-fallback error', () => {
                const error = new Error('Invalid input')
                const result = analyzer.analyzeError(error)

                expect(result.retryWithFallback).toBe(false)
            })
        })

        describe('error without stack trace', () => {
            it('should handle error with undefined stack', () => {
                const error = new Error('Test error')
                error.stack = undefined
                const result = analyzer.analyzeError(error)

                expect(result).toBeDefined()
                expect(result.isParserError).toBe(false)
            })

            it('should handle error with empty stack', () => {
                const error = new Error('Test error')
                error.stack = ''
                const result = analyzer.analyzeError(error)

                expect(result).toBeDefined()
            })
        })

        describe('multiple error characteristics', () => {
            it('should detect multiple error characteristics in one error', () => {
                const error = new Error('InnerTubeError: Network timeout')
                const result = analyzer.analyzeError(error)

                expect(result.isParserError).toBe(true)
                expect(result.shouldRetry).toBe(true)
            })

            it('should properly separate unrelated error characteristics', () => {
                const error = new Error('CompositeVideoError: Invalid format')
                const result = analyzer.analyzeError(error)

                expect(result.isCompositeVideoError).toBe(true)
                expect(result.isParserError).toBe(false)
                expect(result.isHypePointsError).toBe(false)
            })
        })
    })

    describe('getErrorResponse', () => {
        describe('parser error handling', () => {
            it('should return parser error response for parser error', () => {
                const errorInfo: YouTubeErrorInfo = {
                    isParserError: true,
                    isCompositeVideoError: false,
                    isHypePointsError: false,
                    isTypeMismatchError: false,
                    isGridShelfViewError: false,
                    isSectionHeaderViewError: false,
                    shouldRetry: false,
                    retryWithFallback: false,
                }

                const response = analyzer.getErrorResponse(errorInfo, mockContext)

                expect(response).toEqual({
                    shouldRetry: true,
                    retryWithFallback: true,
                    userMessage: 'YouTube parser error, trying alternative method...',
                    logLevel: 'warn',
                })
            })

            it('should return parser error response even if shouldRetry is false', () => {
                const errorInfo: YouTubeErrorInfo = {
                    isParserError: true,
                    isCompositeVideoError: false,
                    isHypePointsError: false,
                    isTypeMismatchError: false,
                    isGridShelfViewError: false,
                    isSectionHeaderViewError: false,
                    shouldRetry: false,
                    retryWithFallback: false,
                }

                const response = analyzer.getErrorResponse(errorInfo, mockContext)

                expect(response.shouldRetry).toBe(true)
                expect(response.logLevel).toBe('warn')
            })
        })

        describe('composite video error handling', () => {
            it('should return video format error response for composite video error', () => {
                const errorInfo: YouTubeErrorInfo = {
                    isParserError: false,
                    isCompositeVideoError: true,
                    isHypePointsError: false,
                    isTypeMismatchError: false,
                    isGridShelfViewError: false,
                    isSectionHeaderViewError: false,
                    shouldRetry: true,
                    retryWithFallback: true,
                }

                const response = analyzer.getErrorResponse(errorInfo, mockContext)

                expect(response).toEqual({
                    shouldRetry: false,
                    retryWithFallback: false,
                    userMessage: 'Video format not supported',
                    logLevel: 'error',
                })
            })

            it('should not retry composite video errors even if shouldRetry is true', () => {
                const errorInfo: YouTubeErrorInfo = {
                    isParserError: false,
                    isCompositeVideoError: true,
                    isHypePointsError: false,
                    isTypeMismatchError: false,
                    isGridShelfViewError: false,
                    isSectionHeaderViewError: false,
                    shouldRetry: true,
                    retryWithFallback: true,
                }

                const response = analyzer.getErrorResponse(errorInfo, mockContext)

                expect(response.shouldRetry).toBe(false)
                expect(response.retryWithFallback).toBe(false)
            })
        })

        describe('hype points error handling', () => {
            it('should return hype points error response', () => {
                const errorInfo: YouTubeErrorInfo = {
                    isParserError: false,
                    isCompositeVideoError: false,
                    isHypePointsError: true,
                    isTypeMismatchError: false,
                    isGridShelfViewError: false,
                    isSectionHeaderViewError: false,
                    shouldRetry: false,
                    retryWithFallback: false,
                }

                const response = analyzer.getErrorResponse(errorInfo, mockContext)

                expect(response).toEqual({
                    shouldRetry: true,
                    retryWithFallback: false,
                    userMessage: 'YouTube hype points error, retrying...',
                    logLevel: 'warn',
                })
            })
        })

        describe('type mismatch error handling', () => {
            it('should return type mismatch error response', () => {
                const errorInfo: YouTubeErrorInfo = {
                    isParserError: false,
                    isCompositeVideoError: false,
                    isHypePointsError: false,
                    isTypeMismatchError: true,
                    isGridShelfViewError: false,
                    isSectionHeaderViewError: false,
                    shouldRetry: false,
                    retryWithFallback: false,
                }

                const response = analyzer.getErrorResponse(errorInfo, mockContext)

                expect(response).toEqual({
                    shouldRetry: true,
                    retryWithFallback: true,
                    userMessage: 'YouTube type mismatch, trying alternative method...',
                    logLevel: 'warn',
                })
            })
        })

        describe('grid shelf view error handling', () => {
            it('should return grid shelf view error response', () => {
                const errorInfo: YouTubeErrorInfo = {
                    isParserError: false,
                    isCompositeVideoError: false,
                    isHypePointsError: false,
                    isTypeMismatchError: false,
                    isGridShelfViewError: true,
                    isSectionHeaderViewError: false,
                    shouldRetry: false,
                    retryWithFallback: false,
                }

                const response = analyzer.getErrorResponse(errorInfo, mockContext)

                expect(response).toEqual({
                    shouldRetry: true,
                    retryWithFallback: false,
                    userMessage: 'YouTube grid shelf error, retrying...',
                    logLevel: 'warn',
                })
            })
        })

        describe('section header view error handling', () => {
            it('should return section header view error response', () => {
                const errorInfo: YouTubeErrorInfo = {
                    isParserError: false,
                    isCompositeVideoError: false,
                    isHypePointsError: false,
                    isTypeMismatchError: false,
                    isGridShelfViewError: false,
                    isSectionHeaderViewError: true,
                    shouldRetry: false,
                    retryWithFallback: false,
                }

                const response = analyzer.getErrorResponse(errorInfo, mockContext)

                expect(response).toEqual({
                    shouldRetry: true,
                    retryWithFallback: false,
                    userMessage: 'YouTube section header error, retrying...',
                    logLevel: 'warn',
                })
            })
        })

        describe('fallback to generic error response', () => {
            it('should return generic error response when no specific error matches', () => {
                const errorInfo: YouTubeErrorInfo = {
                    isParserError: false,
                    isCompositeVideoError: false,
                    isHypePointsError: false,
                    isTypeMismatchError: false,
                    isGridShelfViewError: false,
                    isSectionHeaderViewError: false,
                    shouldRetry: true,
                    retryWithFallback: false,
                }

                const response = analyzer.getErrorResponse(errorInfo, mockContext)

                expect(response).toEqual({
                    shouldRetry: true,
                    retryWithFallback: false,
                    userMessage: 'YouTube error occurred',
                    logLevel: 'error',
                })
            })

            it('should use shouldRetry from errorInfo in generic response', () => {
                const errorInfo: YouTubeErrorInfo = {
                    isParserError: false,
                    isCompositeVideoError: false,
                    isHypePointsError: false,
                    isTypeMismatchError: false,
                    isGridShelfViewError: false,
                    isSectionHeaderViewError: false,
                    shouldRetry: false,
                    retryWithFallback: false,
                }

                const response = analyzer.getErrorResponse(errorInfo, mockContext)

                expect(response.shouldRetry).toBe(false)
            })

            it('should use retryWithFallback from errorInfo in generic response', () => {
                const errorInfo: YouTubeErrorInfo = {
                    isParserError: false,
                    isCompositeVideoError: false,
                    isHypePointsError: false,
                    isTypeMismatchError: false,
                    isGridShelfViewError: false,
                    isSectionHeaderViewError: false,
                    shouldRetry: true,
                    retryWithFallback: true,
                }

                const response = analyzer.getErrorResponse(errorInfo, mockContext)

                expect(response.retryWithFallback).toBe(true)
            })
        })

        describe('error hierarchy priority', () => {
            it('should prioritize parser error over other errors', () => {
                const errorInfo: YouTubeErrorInfo = {
                    isParserError: true,
                    isCompositeVideoError: true,
                    isHypePointsError: true,
                    isTypeMismatchError: true,
                    isGridShelfViewError: true,
                    isSectionHeaderViewError: true,
                    shouldRetry: false,
                    retryWithFallback: false,
                }

                const response = analyzer.getErrorResponse(errorInfo, mockContext)

                expect(response.userMessage).toBe(
                    'YouTube parser error, trying alternative method...',
                )
            })

            it('should prioritize composite video error over retryable errors', () => {
                const errorInfo: YouTubeErrorInfo = {
                    isParserError: false,
                    isCompositeVideoError: true,
                    isHypePointsError: true,
                    isTypeMismatchError: true,
                    isGridShelfViewError: true,
                    isSectionHeaderViewError: true,
                    shouldRetry: true,
                    retryWithFallback: true,
                }

                const response = analyzer.getErrorResponse(errorInfo, mockContext)

                expect(response.userMessage).toBe('Video format not supported')
            })

            it('should prioritize hype points error first among retryable errors', () => {
                const errorInfo: YouTubeErrorInfo = {
                    isParserError: false,
                    isCompositeVideoError: false,
                    isHypePointsError: true,
                    isTypeMismatchError: true,
                    isGridShelfViewError: true,
                    isSectionHeaderViewError: true,
                    shouldRetry: false,
                    retryWithFallback: false,
                }

                const response = analyzer.getErrorResponse(errorInfo, mockContext)

                expect(response.userMessage).toBe(
                    'YouTube hype points error, retrying...',
                )
            })

            it('should prioritize type mismatch error second among retryable errors', () => {
                const errorInfo: YouTubeErrorInfo = {
                    isParserError: false,
                    isCompositeVideoError: false,
                    isHypePointsError: false,
                    isTypeMismatchError: true,
                    isGridShelfViewError: true,
                    isSectionHeaderViewError: true,
                    shouldRetry: false,
                    retryWithFallback: false,
                }

                const response = analyzer.getErrorResponse(errorInfo, mockContext)

                expect(response.userMessage).toBe(
                    'YouTube type mismatch, trying alternative method...',
                )
            })

            it('should prioritize grid shelf view error third among retryable errors', () => {
                const errorInfo: YouTubeErrorInfo = {
                    isParserError: false,
                    isCompositeVideoError: false,
                    isHypePointsError: false,
                    isTypeMismatchError: false,
                    isGridShelfViewError: true,
                    isSectionHeaderViewError: true,
                    shouldRetry: false,
                    retryWithFallback: false,
                }

                const response = analyzer.getErrorResponse(errorInfo, mockContext)

                expect(response.userMessage).toBe(
                    'YouTube grid shelf error, retrying...',
                )
            })

            it('should prioritize section header view error fourth among retryable errors', () => {
                const errorInfo: YouTubeErrorInfo = {
                    isParserError: false,
                    isCompositeVideoError: false,
                    isHypePointsError: false,
                    isTypeMismatchError: false,
                    isGridShelfViewError: false,
                    isSectionHeaderViewError: true,
                    shouldRetry: false,
                    retryWithFallback: false,
                }

                const response = analyzer.getErrorResponse(errorInfo, mockContext)

                expect(response.userMessage).toBe(
                    'YouTube section header error, retrying...',
                )
            })
        })

        describe('context parameter handling', () => {
            it('should accept context parameter even though it is unused', () => {
                const errorInfo: YouTubeErrorInfo = {
                    isParserError: false,
                    isCompositeVideoError: false,
                    isHypePointsError: false,
                    isTypeMismatchError: false,
                    isGridShelfViewError: false,
                    isSectionHeaderViewError: false,
                    shouldRetry: false,
                    retryWithFallback: false,
                }

                const response = analyzer.getErrorResponse(errorInfo, mockContext)

                expect(response).toBeDefined()
                expect(response.userMessage).toBe('YouTube error occurred')
            })

            it('should handle context with optional guildId', () => {
                const contextWithoutGuild: YouTubeErrorContext = {
                    query: 'test query',
                    userId: 'user-123',
                    timestamp: Date.now(),
                }

                const errorInfo: YouTubeErrorInfo = {
                    isParserError: false,
                    isCompositeVideoError: false,
                    isHypePointsError: false,
                    isTypeMismatchError: false,
                    isGridShelfViewError: false,
                    isSectionHeaderViewError: false,
                    shouldRetry: false,
                    retryWithFallback: false,
                }

                const response = analyzer.getErrorResponse(
                    errorInfo,
                    contextWithoutGuild,
                )

                expect(response).toBeDefined()
            })
        })
    })

    describe('integration: analyze then respond', () => {
        it('should analyze error and get appropriate response for parser error', () => {
            const error = new Error('InnerTubeError: Invalid request')
            const errorInfo = analyzer.analyzeError(error)
            const response = analyzer.getErrorResponse(errorInfo, mockContext)

            expect(errorInfo.isParserError).toBe(true)
            expect(response.userMessage).toBe(
                'YouTube parser error, trying alternative method...',
            )
            expect(response.logLevel).toBe('warn')
        })

        it('should analyze error and get appropriate response for network timeout', () => {
            const error = new Error('Request timeout')
            const errorInfo = analyzer.analyzeError(error)
            const response = analyzer.getErrorResponse(errorInfo, mockContext)

            expect(errorInfo.shouldRetry).toBe(true)
            expect(response.shouldRetry).toBe(true)
            expect(response.logLevel).toBe('error')
        })

        it('should analyze error and get appropriate response for cipher failure', () => {
            const error = new Error('Cipher decryption failed')
            const errorInfo = analyzer.analyzeError(error)
            const response = analyzer.getErrorResponse(errorInfo, mockContext)

            expect(errorInfo.retryWithFallback).toBe(true)
            expect(response.retryWithFallback).toBe(true)
        })

        it('should analyze error and get appropriate response for composite video error', () => {
            const error = new Error('CompositeVideoError: Format not supported')
            const errorInfo = analyzer.analyzeError(error)
            const response = analyzer.getErrorResponse(errorInfo, mockContext)

            expect(errorInfo.isCompositeVideoError).toBe(true)
            expect(response.shouldRetry).toBe(false)
            expect(response.userMessage).toBe('Video format not supported')
        })
    })
})
