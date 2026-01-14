/**
 * YouTube error handler types and interfaces
 */

export type YouTubeErrorInfo = {
    isParserError: boolean
    isCompositeVideoError: boolean
    isHypePointsError: boolean
    isTypeMismatchError: boolean
    isGridShelfViewError: boolean
    isSectionHeaderViewError: boolean
    shouldRetry: boolean
    retryWithFallback: boolean
}

export type YouTubeErrorContext = {
    query: string
    userId: string
    guildId?: string
    timestamp: number
}

export type YouTubeErrorResponse = {
    shouldRetry: boolean
    retryWithFallback: boolean
    userMessage: string
    logLevel: 'error' | 'warn' | 'info'
}
