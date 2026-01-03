// import { errorLog, warnLog } from "../../general/log"
import type {
    YouTubeErrorInfo,
    YouTubeErrorContext,
    YouTubeErrorResponse,
} from './types'

/**
 * YouTube error analyzer
 */
export class YouTubeErrorAnalyzer {
    analyzeError(error: Error): YouTubeErrorInfo {
        const errorMessage = error.message.toLowerCase()
        const errorStack = error.stack?.toLowerCase() ?? ''

        const isParserError =
            errorMessage.includes('innertubeerror') ||
            errorMessage.includes('parsingerror') ||
            errorStack.includes('youtubei.js')

        const isCompositeVideoError = errorMessage.includes(
            'compositevideoerror',
        )

        const isHypePointsError = errorMessage.includes('hypepoints')

        const isTypeMismatchError = errorMessage.includes('typemismatch')

        const isGridShelfViewError = errorMessage.includes('gridshelfview')

        const isSectionHeaderViewError =
            errorMessage.includes('sectionheaderview')

        const shouldRetry = this.shouldRetryError(error)
        const retryWithFallback = this.shouldRetryWithFallback(error)

        return {
            isParserError,
            isCompositeVideoError,
            isHypePointsError,
            isTypeMismatchError,
            isGridShelfViewError,
            isSectionHeaderViewError,
            shouldRetry,
            retryWithFallback,
        }
    }

    private shouldRetryError(error: Error): boolean {
        const errorMessage = error.message.toLowerCase()

        // Retry for specific error types
        return (
            errorMessage.includes('timeout') ||
            errorMessage.includes('network') ||
            errorMessage.includes('rate limit') ||
            errorMessage.includes('quota exceeded')
        )
    }

    private shouldRetryWithFallback(error: Error): boolean {
        const errorMessage = error.message.toLowerCase()

        // Retry with fallback for specific error types
        return (
            errorMessage.includes('signature') ||
            errorMessage.includes('cipher') ||
            errorMessage.includes('decrypt')
        )
    }

    private handleParserError(): YouTubeErrorResponse {
        return {
            shouldRetry: true,
            retryWithFallback: true,
            userMessage: 'YouTube parser error, trying alternative method...',
            logLevel: 'warn',
        }
    }

    private handleVideoFormatError(): YouTubeErrorResponse {
        return {
            shouldRetry: false,
            retryWithFallback: false,
            userMessage: 'Video format not supported',
            logLevel: 'error',
        }
    }

    private handleRetryableErrors(
        errorInfo: YouTubeErrorInfo,
    ): YouTubeErrorResponse | null {
        if (errorInfo.isHypePointsError) {
            return {
                shouldRetry: true,
                retryWithFallback: false,
                userMessage: 'YouTube hype points error, retrying...',
                logLevel: 'warn',
            }
        }

        if (errorInfo.isTypeMismatchError) {
            return {
                shouldRetry: true,
                retryWithFallback: true,
                userMessage:
                    'YouTube type mismatch, trying alternative method...',
                logLevel: 'warn',
            }
        }

        if (errorInfo.isGridShelfViewError) {
            return {
                shouldRetry: true,
                retryWithFallback: false,
                userMessage: 'YouTube grid shelf error, retrying...',
                logLevel: 'warn',
            }
        }

        if (errorInfo.isSectionHeaderViewError) {
            return {
                shouldRetry: true,
                retryWithFallback: false,
                userMessage: 'YouTube section header error, retrying...',
                logLevel: 'warn',
            }
        }

        return null
    }

    getErrorResponse(
        errorInfo: YouTubeErrorInfo,
        _context: YouTubeErrorContext,
    ): YouTubeErrorResponse {
        if (errorInfo.isParserError) {
            return this.handleParserError()
        }

        if (errorInfo.isCompositeVideoError) {
            return this.handleVideoFormatError()
        }

        const retryableError = this.handleRetryableErrors(errorInfo)
        if (retryableError) {
            return retryableError
        }

        return {
            shouldRetry: errorInfo.shouldRetry,
            retryWithFallback: errorInfo.retryWithFallback,
            userMessage: 'YouTube error occurred',
            logLevel: 'error',
        }
    }
}
