import { describe, expect, it, jest, beforeEach } from '@jest/globals'

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    warnLog: jest.fn(),
}))

jest.mock('./analyzer', () => ({
    YouTubeErrorAnalyzer: jest.fn(function () {
        this.analyzeError = jest.fn()
        this.getErrorResponse = jest.fn()
    }),
}))

import {
    YouTubeErrorHandler,
    youtubeErrorHandler,
    analyzeYouTubeError,
    logYouTubeError,
    isRecoverableYouTubeError,
    createYouTubeErrorMessage,
} from './index'
import type { YouTubeErrorInfo } from './types'

const NO_FLAGS: YouTubeErrorInfo = {
    isParserError: false,
    isCompositeVideoError: false,
    isHypePointsError: false,
    isTypeMismatchError: false,
    isGridShelfViewError: false,
    isSectionHeaderViewError: false,
    shouldRetry: false,
    retryWithFallback: false,
}

function info(overrides: Partial<YouTubeErrorInfo> = {}): YouTubeErrorInfo {
    return { ...NO_FLAGS, ...overrides }
}

/**
 * Reaches into the handler's analyzer double. YouTubeErrorHandler news up its
 * own YouTubeErrorAnalyzer in the constructor, so there is no seam to inject
 * one through; the mocked class above is the only handle on it.
 */
function analyzerOf(handler: YouTubeErrorHandler) {
    return (handler as unknown as { analyzer: Record<string, jest.Mock> })
        .analyzer
}

describe('YouTubeErrorHandler', () => {
    let handler: YouTubeErrorHandler

    beforeEach(() => {
        jest.clearAllMocks()
        handler = new YouTubeErrorHandler()
    })

    describe('createYouTubeErrorMessage', () => {
        // One case per branch, in the order the method tests them, so a
        // reordering that lets an earlier flag shadow a later one shows up.
        it.each([
            ['isParserError', 'YouTube parser error, please try again'],
            ['isCompositeVideoError', 'Video format not supported'],
            [
                'isHypePointsError',
                'YouTube hype points error, please try again',
            ],
            ['isTypeMismatchError', 'YouTube type mismatch, please try again'],
            [
                'isGridShelfViewError',
                'YouTube grid shelf error, please try again',
            ],
            [
                'isSectionHeaderViewError',
                'YouTube section header error, please try again',
            ],
        ] as [keyof YouTubeErrorInfo, string][])(
            'maps %s to its own message',
            (flag, expected) => {
                analyzerOf(handler).analyzeError.mockReturnValue(
                    info({ [flag]: true }),
                )

                expect(handler.createYouTubeErrorMessage(new Error('x'))).toBe(
                    expected,
                )
            },
        )

        it('falls back to a generic message when no flag is set', () => {
            analyzerOf(handler).analyzeError.mockReturnValue(info())

            expect(handler.createYouTubeErrorMessage(new Error('x'))).toBe(
                'YouTube error occurred, please try again',
            )
        })
    })

    describe('isRecoverableYouTubeError', () => {
        it.each([
            [{ shouldRetry: true }, true],
            [{ retryWithFallback: true }, true],
            [{}, false],
        ] as [Partial<YouTubeErrorInfo>, boolean][])(
            'returns %s for %o',
            (flags, expected) => {
                analyzerOf(handler).analyzeError.mockReturnValue(info(flags))

                expect(handler.isRecoverableYouTubeError(new Error('x'))).toBe(
                    expected,
                )
            },
        )
    })

    describe('logYouTubeError', () => {
        function arrange(logLevel: 'error' | 'warn' | 'info') {
            analyzerOf(handler).analyzeError.mockReturnValue(info())
            analyzerOf(handler).getErrorResponse.mockReturnValue({
                shouldRetry: false,
                retryWithFallback: false,
                userMessage: 'nope',
                logLevel,
            })
        }

        it('routes an error-level response to errorLog', () => {
            const { errorLog, warnLog } = require('@lucky/shared/utils')
            arrange('error')

            handler.logYouTubeError(new Error('boom'), 'a query', 'user1')

            expect(errorLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: 'boom',
                    query: 'a query',
                    userId: 'user1',
                }),
            )
            expect(warnLog).not.toHaveBeenCalled()
        })

        it('routes a warn-level response to warnLog', () => {
            const { errorLog, warnLog } = require('@lucky/shared/utils')
            arrange('warn')

            handler.logYouTubeError(new Error('boom'), 'a query', 'user1')

            expect(warnLog).toHaveBeenCalled()
            expect(errorLog).not.toHaveBeenCalled()
        })

        it('logs nothing for an info-level response', () => {
            const { errorLog, warnLog } = require('@lucky/shared/utils')
            arrange('info')

            handler.logYouTubeError(new Error('boom'), 'a query', 'user1')

            expect(errorLog).not.toHaveBeenCalled()
            expect(warnLog).not.toHaveBeenCalled()
        })

        it('passes the query and user through as the error context', () => {
            arrange('error')

            handler.logYouTubeError(new Error('boom'), 'a query', 'user1')

            expect(analyzerOf(handler).getErrorResponse).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    query: 'a query',
                    userId: 'user1',
                    timestamp: expect.any(Number),
                }),
            )
        })
    })
})

describe('module-level helpers', () => {
    // These delegate to `youtubeErrorHandler`, a singleton built at import
    // time, so they run against a different analyzer instance than the tests
    // above and need it stubbed separately.
    beforeEach(() => {
        jest.clearAllMocks()
        analyzerOf(youtubeErrorHandler).getErrorResponse.mockReturnValue({
            shouldRetry: false,
            retryWithFallback: false,
            userMessage: 'nope',
            logLevel: 'error',
        })
    })

    it('analyzeYouTubeError returns what the analyzer reported', () => {
        const expected = info({ isParserError: true })
        analyzerOf(youtubeErrorHandler).analyzeError.mockReturnValue(expected)

        expect(analyzeYouTubeError(new Error('x'))).toBe(expected)
    })

    it('createYouTubeErrorMessage routes through the singleton', () => {
        analyzerOf(youtubeErrorHandler).analyzeError.mockReturnValue(
            info({ isHypePointsError: true }),
        )

        expect(createYouTubeErrorMessage(new Error('x'))).toBe(
            'YouTube hype points error, please try again',
        )
    })

    it('isRecoverableYouTubeError routes through the singleton', () => {
        analyzerOf(youtubeErrorHandler).analyzeError.mockReturnValue(
            info({ retryWithFallback: true }),
        )

        expect(isRecoverableYouTubeError(new Error('x'))).toBe(true)
    })

    it('logYouTubeError forwards query and user to the singleton', () => {
        const { errorLog } = require('@lucky/shared/utils')
        analyzerOf(youtubeErrorHandler).analyzeError.mockReturnValue(info())

        logYouTubeError(new Error('boom'), 'a query', 'user1')

        expect(errorLog).toHaveBeenCalledWith(
            expect.objectContaining({
                error: 'boom',
                query: 'a query',
                userId: 'user1',
            }),
        )
    })
})
