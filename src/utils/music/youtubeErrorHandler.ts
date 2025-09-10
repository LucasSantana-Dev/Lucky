import { errorLog, warnLog } from "../general/log"
import type { QueryType } from "discord-player"
import { youtubeConfig } from "../../config/youtubeConfig"

export interface YouTubeErrorInfo {
    isParserError: boolean
    isCompositeVideoError: boolean
    isHypePointsError: boolean
    isTypeMismatchError: boolean
    isGridShelfViewError: boolean
    isSectionHeaderViewError: boolean
    shouldRetry: boolean
    retryWithFallback: boolean
}

/**
 * Analyzes YouTube.js errors to determine the type and appropriate response
 */
export function analyzeYouTubeError(error: Error): YouTubeErrorInfo {
    const errorMessage = error.message.toLowerCase()
    const errorStack = error.stack?.toLowerCase() ?? ""

    const isParserError =
        errorMessage.includes("innertubeerror") ||
        errorMessage.includes("parsingerror") ||
        errorStack.includes("youtubei.js")

    const isCompositeVideoError = errorMessage.includes(
        "compositevideoprimaryinfo",
    )
    const isHypePointsError = errorMessage.includes("hypepointsfactoid")
    const isTypeMismatchError = errorMessage.includes("type mismatch")
    const isGridShelfViewError = errorMessage.includes("gridshelfview")
    const isSectionHeaderViewError = errorMessage.includes("sectionheaderview")

    // Determine if we should retry with different search engines
    const shouldRetry =
        isParserError &&
        (isCompositeVideoError ||
            isHypePointsError ||
            isTypeMismatchError ||
            isGridShelfViewError ||
            isSectionHeaderViewError)
    const retryWithFallback = shouldRetry

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

/**
 * Creates a user-friendly error message for YouTube parser errors
 */
export function createYouTubeErrorMessage(errorInfo: YouTubeErrorInfo): string {
    if (
        errorInfo.isCompositeVideoError ||
        errorInfo.isHypePointsError ||
        errorInfo.isGridShelfViewError ||
        errorInfo.isSectionHeaderViewError
    ) {
        return youtubeConfig.errorMessages.compositeVideoError
    }

    if (errorInfo.isTypeMismatchError) {
        return youtubeConfig.errorMessages.typeMismatchError
    }

    if (errorInfo.isParserError) {
        return youtubeConfig.errorMessages.parserError
    }

    return youtubeConfig.errorMessages.generalError
}

/**
 * Gets fallback search engines to try when YouTube parser fails
 */
export function getFallbackSearchEngines(): QueryType[] {
    return [...youtubeConfig.fallbackEngines]
}

/**
 * Checks if an error is a recoverable YouTube parser error
 */
export function isRecoverableYouTubeError(error: Error): boolean {
    const errorInfo = analyzeYouTubeError(error)
    return errorInfo.shouldRetry
}

/**
 * Logs YouTube-specific errors with appropriate level and context
 */
export function logYouTubeError(
    error: Error,
    context: string = "YouTube search",
): void {
    const errorInfo = analyzeYouTubeError(error)

    if (errorInfo.isParserError) {
        const logLevel = youtubeConfig.errorHandling.logParserErrorsAsWarnings
            ? warnLog
            : errorLog
        logLevel({
            message: `YouTube parser error in ${context}`,
            data: {
                errorType: errorInfo.isCompositeVideoError
                    ? "CompositeVideoPrimaryInfo"
                    : errorInfo.isHypePointsError
                      ? "HypePointsFactoid"
                      : errorInfo.isGridShelfViewError
                        ? "GridShelfView"
                        : errorInfo.isSectionHeaderViewError
                          ? "SectionHeaderView"
                          : errorInfo.isTypeMismatchError
                            ? "TypeMismatch"
                            : "Parser",
                shouldRetry: errorInfo.shouldRetry,
                originalError: error.message,
            },
        })
    } else {
        errorLog({
            message: `Error in ${context}`,
            error,
        })
    }
}
