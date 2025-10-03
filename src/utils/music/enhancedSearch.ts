import type { Player, SearchResult } from "discord-player"
import { QueryType } from "discord-player"
import type { User } from "discord.js"
import { debugLog, warnLog } from "../general/log"
import {
    analyzeYouTubeError,
    createYouTubeErrorMessage,
    getFallbackSearchEngines,
    logYouTubeError,
} from "./youtubeErrorHandler"
import { youtubeConfig } from "../../config/youtubeConfig"

export type EnhancedSearchOptions = {
    query: string
    requestedBy: User
    preferredEngine?: QueryType
    maxRetries?: number
    enableFallbacks?: boolean
}

export type EnhancedSearchResult = {
    success: boolean
    result?: SearchResult
    error?: string
    usedFallback?: boolean
    attempts?: number
}

/**
 * Enhanced search function with fallback mechanisms for YouTube parser errors
 */
export async function enhancedSearch(
    player: Player,
    options: EnhancedSearchOptions,
): Promise<EnhancedSearchResult> {
    const {
        query,
        requestedBy,
        preferredEngine = QueryType.YOUTUBE_SEARCH,
        maxRetries = youtubeConfig.errorHandling.maxRetries,
        enableFallbacks = youtubeConfig.errorHandling.enableFallbacks,
    } = options

    debugLog({ message: `Starting enhanced search for: ${query}` })

    // Set up a timeout to prevent hanging
    const searchTimeout = new Promise<EnhancedSearchResult>((_, reject) => {
        setTimeout(() => {
            reject(new Error("Search timeout - operation took too long"))
        }, 15000) // 15 second timeout
    })

    const searchOperation = async (): Promise<EnhancedSearchResult> => {
        // Try the preferred engine first
        let lastError: Error | null = null
        let attempts = 0

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            attempts = attempt

            try {
                debugLog({
                    message: `Search attempt ${attempt}/${maxRetries} with engine: ${preferredEngine}`,
                })

                const result = await player.search(query, {
                    requestedBy,
                    searchEngine: preferredEngine,
                })

                if (result?.tracks && result.tracks.length > 0) {
                    debugLog({
                        message: `Search successful on attempt ${attempt}`,
                    })
                    return {
                        success: true,
                        result,
                        attempts,
                    }
                }

                // If no results but no error, try next attempt
                debugLog({
                    message: `No results on attempt ${attempt}, retrying...`,
                })
            } catch (error) {
                lastError = error as Error
                logYouTubeError(lastError, `search attempt ${attempt}`)

                const errorInfo = analyzeYouTubeError(lastError)

                // If it's a recoverable YouTube parser error, try fallbacks immediately
                if (errorInfo.shouldRetry && enableFallbacks) {
                    debugLog({
                        message: `YouTube parser error detected, trying fallback engines immediately...`,
                    })

                    const fallbackResult = await tryFallbackEngines(
                        player,
                        query,
                        requestedBy,
                    )
                    if (fallbackResult.success) {
                        return {
                            ...fallbackResult,
                            usedFallback: true,
                            attempts: attempt,
                        }
                    }

                    // If fallbacks also failed, don't retry the same engine
                    debugLog({
                        message: `All fallback engines failed, stopping retries`,
                    })
                    break
                }

                // If not recoverable or fallbacks failed, continue to next attempt
                if (attempt < maxRetries) {
                    debugLog({
                        message: `Attempt ${attempt} failed, retrying...`,
                    })
                    // Add a delay between retries using config
                    await new Promise((resolve) =>
                        setTimeout(
                            resolve,
                            youtubeConfig.errorHandling.retryDelay * attempt,
                        ),
                    )
                }
            }
        }

        // All attempts failed
        const errorMessage = lastError
            ? createYouTubeErrorMessage(analyzeYouTubeError(lastError))
            : youtubeConfig.errorMessages.noResults

        warnLog({
            message: `All search attempts failed for query: ${query}`,
            data: { attempts, lastError: lastError?.message },
        })

        return {
            success: false,
            error: errorMessage,
            attempts,
        }
    }

    // Race between the search operation and timeout
    try {
        return await Promise.race([searchOperation(), searchTimeout])
    } catch (timeoutError) {
        warnLog({
            message: `Search timed out for query: ${query}`,
            error: timeoutError,
        })
        return {
            success: false,
            error: "A busca demorou muito para ser concluída. Tente novamente.",
            attempts: 0,
        }
    }
}

/**
 * Tries fallback search engines when YouTube parser fails
 */
async function tryFallbackEngines(
    player: Player,
    query: string,
    requestedBy: User,
): Promise<EnhancedSearchResult> {
    const fallbackEngines = getFallbackSearchEngines()

    debugLog({ message: `Trying ${fallbackEngines.length} fallback engines` })

    // Try non-YouTube engines first when YouTube parser errors occur
    const nonYouTubeEngines = fallbackEngines.filter(
        (engine) =>
            engine !== QueryType.YOUTUBE_SEARCH &&
            engine !== QueryType.YOUTUBE_VIDEO &&
            engine !== QueryType.YOUTUBE_PLAYLIST,
    )

    // Try non-YouTube engines first
    for (const engine of nonYouTubeEngines) {
        try {
            debugLog({
                message: `Trying non-YouTube fallback engine: ${engine}`,
            })

            // Add a timeout for each fallback engine attempt
            const engineTimeout = new Promise<never>((_, reject) => {
                setTimeout(
                    () => reject(new Error(`Engine ${engine} timeout`)),
                    5000,
                ) // 5 second timeout per engine
            })

            const searchPromise = player.search(query, {
                requestedBy,
                searchEngine: engine,
            })

            const result = await Promise.race([searchPromise, engineTimeout])

            if (result?.tracks && result.tracks.length > 0) {
                debugLog({
                    message: `Non-YouTube fallback search successful with engine: ${engine}`,
                })
                return {
                    success: true,
                    result,
                }
            }
        } catch (error) {
            debugLog({
                message: `Non-YouTube fallback engine ${engine} failed: ${(error as Error).message}`,
            })
            // Continue to next fallback engine
        }
    }

    // If non-YouTube engines failed, try YouTube engines as last resort
    const youtubeEngines = fallbackEngines.filter(
        (engine) =>
            engine === QueryType.YOUTUBE_SEARCH ||
            engine === QueryType.YOUTUBE_VIDEO ||
            engine === QueryType.YOUTUBE_PLAYLIST,
    )

    for (const engine of youtubeEngines) {
        try {
            debugLog({ message: `Trying YouTube fallback engine: ${engine}` })

            // Add a timeout for each fallback engine attempt
            const engineTimeout = new Promise<never>((_, reject) => {
                setTimeout(
                    () => reject(new Error(`Engine ${engine} timeout`)),
                    5000,
                ) // 5 second timeout per engine
            })

            const searchPromise = player.search(query, {
                requestedBy,
                searchEngine: engine,
            })

            const result = await Promise.race([searchPromise, engineTimeout])

            if (result?.tracks && result.tracks.length > 0) {
                debugLog({
                    message: `YouTube fallback search successful with engine: ${engine}`,
                })
                return {
                    success: true,
                    result,
                }
            }
        } catch (error) {
            debugLog({
                message: `YouTube fallback engine ${engine} failed: ${(error as Error).message}`,
            })
            // Continue to next fallback engine
        }
    }

    return {
        success: false,
        error: youtubeConfig.errorMessages.allEnginesFailed,
    }
}

/**
 * Enhanced search specifically for YouTube content with better error handling
 */
export async function enhancedYouTubeSearch(
    player: Player,
    query: string,
    requestedBy: User,
    isPlaylist: boolean = false,
): Promise<EnhancedSearchResult> {
    const preferredEngine = isPlaylist
        ? QueryType.YOUTUBE_PLAYLIST
        : QueryType.YOUTUBE_SEARCH

    return enhancedSearch(player, {
        query,
        requestedBy,
        preferredEngine,
        maxRetries: 2, // Fewer retries for YouTube-specific search
        enableFallbacks: true,
    })
}

/**
 * Enhanced search for any content type with automatic engine detection
 */
export async function enhancedAutoSearch(
    player: Player,
    query: string,
    requestedBy: User,
): Promise<EnhancedSearchResult> {
    return enhancedSearch(player, {
        query,
        requestedBy,
        preferredEngine: QueryType.AUTO,
        maxRetries: 3,
        enableFallbacks: true,
    })
}
