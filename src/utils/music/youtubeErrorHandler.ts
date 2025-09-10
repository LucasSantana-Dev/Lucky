import { errorLog, warnLog } from "../general/log"
import type { QueryType } from "discord-player"
import { youtubeConfig } from "../../config/youtubeConfig"
import { YouTubeError, type ErrorMetadata } from "../../types/errors"
import { createCorrelationId } from "../error/errorHandler"

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
 * Creates a structured YouTube error from an unknown error
 */
export function createYouTubeError(
    error: unknown,
    context: string = "YouTube search",
    metadata: Partial<ErrorMetadata> = {},
): YouTubeError {
    const errorInfo = analyzeYouTubeError(
        error instanceof Error ? error : new Error(String(error)),
    )

    let userMessage: string = youtubeConfig.errorMessages.generalError

    if (
        errorInfo.isCompositeVideoError ||
        errorInfo.isHypePointsError ||
        errorInfo.isGridShelfViewError ||
        errorInfo.isSectionHeaderViewError
    ) {
        userMessage = youtubeConfig.errorMessages.compositeVideoError
    } else if (errorInfo.isTypeMismatchError) {
        userMessage = youtubeConfig.errorMessages.typeMismatchError
    } else if (errorInfo.isParserError) {
        userMessage = youtubeConfig.errorMessages.parserError
    }

    const structuredError = new YouTubeError(
        userMessage,
        {
            correlationId: createCorrelationId(),
            retryable: errorInfo.shouldRetry,
            details: {
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
                originalError:
                    error instanceof Error ? error.message : String(error),
                context,
            },
            ...metadata,
        },
        error instanceof Error ? error : undefined,
    )

    return structuredError
}

/**
 * Logs YouTube-specific errors with appropriate level and context
 */
export function logYouTubeError(
    error: unknown,
    context: string = "YouTube search",
    metadata: Partial<ErrorMetadata> = {},
): YouTubeError {
    const structuredError = createYouTubeError(error, context, metadata)

    if (
        structuredError.metadata.details?.errorType &&
        youtubeConfig.errorHandling.logParserErrorsAsWarnings
    ) {
        warnLog({
            message: `YouTube parser error in ${context}`,
            error: structuredError,
            correlationId: structuredError.metadata.correlationId,
            data: structuredError.metadata.details,
        })
    } else {
        errorLog({
            message: `YouTube error in ${context}`,
            error: structuredError,
            correlationId: structuredError.metadata.correlationId,
        })
    }

    return structuredError
}
