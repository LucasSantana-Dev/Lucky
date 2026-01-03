import { QueryType, type Player, type SearchResult } from 'discord-player'
import { debugLog } from '../../general/log'
import {
    createYouTubeErrorMessage,
    logYouTubeError,
} from '../youtubeErrorHandler'
// Removed unused import
import type {
    EnhancedSearchOptions,
    EnhancedSearchResult,
    SearchEngineConfig,
} from './types'

/**
 * Search engine manager with fallback mechanisms
 */
export class SearchEngineManager {
    constructor(private readonly player: Player) {}

    /**
     * Try primary search engine
     */
    private async tryPrimarySearch(
        options: EnhancedSearchOptions,
        _config: SearchEngineConfig,
    ): Promise<{ success: boolean; result?: SearchResult; error?: Error }> {
        try {
            const result = await this.player.search(options.query, {
                requestedBy: options.requestedBy,
            })

            if (result.tracks.length > 0) {
                return { success: true, result }
            }
            return { success: false }
        } catch (error) {
            const errorObj = error as Error
            logYouTubeError(errorObj, options.query, options.requestedBy.id)
            return { success: false, error: errorObj }
        }
    }

    /**
     * Try fallback search engines
     */
    private async tryFallbackSearch(
        options: EnhancedSearchOptions,
        _config: SearchEngineConfig,
    ): Promise<{
        success: boolean
        result?: SearchResult
        error?: Error
        attempts: number
    }> {
        const fallbackEngines = ['youtube', 'spotify'] // Default fallback engines
        let attempts = 0

        for (const _engine of fallbackEngines) {
            attempts++
            try {
                const result = await this.player.search(options.query, {
                    requestedBy: options.requestedBy,
                })

                if (result.tracks.length > 0) {
                    return { success: true, result, attempts }
                }
            } catch (error) {
                const errorObj = error as Error
                logYouTubeError(errorObj, options.query, options.requestedBy.id)
                return { success: false, error: errorObj, attempts }
            }
        }

        return { success: false, attempts }
    }

    async performSearch(
        options: EnhancedSearchOptions,
    ): Promise<EnhancedSearchResult> {
        const config: SearchEngineConfig = {
            maxRetries: options.maxRetries ?? 3,
            enableFallbacks: options.enableFallbacks ?? true,
            preferredEngine: options.preferredEngine ?? QueryType.AUTO,
        }

        // Try primary search engine
        const primaryResult = await this.tryPrimarySearch(options, config)
        if (primaryResult.success && primaryResult.result) {
            return {
                success: true,
                result: primaryResult.result as SearchResult,
                attempts: 1,
            }
        }

        // Try fallback engines if enabled
        if (config.enableFallbacks) {
            const fallbackResult = await this.tryFallbackSearch(options, config)
            if (fallbackResult.success && fallbackResult.result) {
                return {
                    success: true,
                    result: fallbackResult.result as SearchResult,
                    usedFallback: true,
                    attempts: fallbackResult.attempts,
                }
            }
        }

        // All attempts failed
        const errorMessage = primaryResult.error
            ? createYouTubeErrorMessage(primaryResult.error)
            : 'No tracks found for the given query'

        return {
            success: false,
            error: errorMessage,
            attempts: 0,
        }
    }

    async performRetrySearch(
        options: EnhancedSearchOptions,
    ): Promise<EnhancedSearchResult> {
        const maxRetries = options.maxRetries ?? 3
        let lastResult: EnhancedSearchResult | null = null

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            debugLog({
                message: `Search attempt ${attempt}/${maxRetries}`,
                data: { query: options.query.substring(0, 100) },
            })

            // Use primary search directly to avoid recursion
            const primaryResult = await this.tryPrimarySearch(options, {
                maxRetries: 1,
                enableFallbacks: false,
                preferredEngine: options.preferredEngine ?? QueryType.AUTO,
            })

            if (primaryResult.success && primaryResult.result) {
                return {
                    success: true,
                    result: primaryResult.result as SearchResult,
                    attempts: attempt,
                }
            }

            lastResult = {
                success: false,
                error: primaryResult.error?.message || 'Search failed',
                attempts: attempt,
            }

            // Wait before retry (exponential backoff)
            if (attempt < maxRetries) {
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
                await new Promise((resolve) => setTimeout(resolve, delay))
            }
        }

        return (
            lastResult ?? {
                success: false,
                error: 'All search attempts failed',
                attempts: maxRetries,
            }
        )
    }
}
