import { YouTubeErrorAnalyzer } from './analyzer'
import { errorLog, warnLog } from '../../general/log'
// import { createCorrelationId } from "../../error/errorHandler"
import type {
    YouTubeErrorInfo,
    YouTubeErrorContext,
    YouTubeErrorResponse,
} from './types'

/**
 * Main YouTube error handler service
 */
export class YouTubeErrorHandler {
    private readonly analyzer: YouTubeErrorAnalyzer

    constructor() {
        this.analyzer = new YouTubeErrorAnalyzer()
    }

    analyzeError(error: Error): YouTubeErrorInfo {
        return this.analyzer.analyzeError(error)
    }

    getErrorResponse(
        errorInfo: YouTubeErrorInfo,
        context: YouTubeErrorContext,
    ): YouTubeErrorResponse {
        return this.analyzer.getErrorResponse(errorInfo, context)
    }

    logYouTubeError(error: Error, query: string, userId: string): void {
        const context: YouTubeErrorContext = {
            query,
            userId,
            timestamp: Date.now(),
        }

        const errorInfo = this.analyzeError(error)
        const response = this.getErrorResponse(errorInfo, context)

        const logData = {
            message: 'YouTube error occurred',
            error: error.message,
            query,
            userId,
            errorInfo,
            response,
        }

        if (response.logLevel === 'error') {
            errorLog(logData)
        } else if (response.logLevel === 'warn') {
            warnLog(logData)
        }
    }

    isRecoverableYouTubeError(error: Error): boolean {
        const errorInfo = this.analyzeError(error)
        return errorInfo.shouldRetry || errorInfo.retryWithFallback
    }

    createYouTubeErrorMessage(error: Error): string {
        const errorInfo = this.analyzeError(error)

        if (errorInfo.isParserError) {
            return 'YouTube parser error, please try again'
        }

        if (errorInfo.isCompositeVideoError) {
            return 'Video format not supported'
        }

        if (errorInfo.isHypePointsError) {
            return 'YouTube hype points error, please try again'
        }

        if (errorInfo.isTypeMismatchError) {
            return 'YouTube type mismatch, please try again'
        }

        if (errorInfo.isGridShelfViewError) {
            return 'YouTube grid shelf error, please try again'
        }

        if (errorInfo.isSectionHeaderViewError) {
            return 'YouTube section header error, please try again'
        }

        return 'YouTube error occurred, please try again'
    }
}

export const youtubeErrorHandler = new YouTubeErrorHandler()

export const analyzeYouTubeError = (error: Error): YouTubeErrorInfo => {
    return youtubeErrorHandler.analyzeError(error)
}

export const logYouTubeError = (
    error: Error,
    query: string,
    userId: string,
): void => {
    youtubeErrorHandler.logYouTubeError(error, query, userId)
}

export const isRecoverableYouTubeError = (error: Error): boolean => {
    return youtubeErrorHandler.isRecoverableYouTubeError(error)
}

export const createYouTubeErrorMessage = (error: Error): string => {
    return youtubeErrorHandler.createYouTubeErrorMessage(error)
}

export type { YouTubeErrorInfo, YouTubeErrorContext, YouTubeErrorResponse }
