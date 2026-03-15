import { QueryType, type Player, type SearchResult } from 'discord-player'
import { debugLog } from '@lucky/shared/utils'
import {
    createYouTubeErrorMessage,
    logYouTubeError,
} from '../youtubeErrorHandler'
import {
    providerHealthService,
    providerFromQueryType,
    type MusicProvider,
} from './providerHealth'
import type { EnhancedSearchOptions, EnhancedSearchResult } from './types'

type SearchAttempt = {
    provider: MusicProvider
    engine: QueryType
}

const SPOTIFY_SEARCH = 'spotifySearch' as QueryType
const SOUNDCLOUD_SEARCH = 'soundcloud' as QueryType

const FALLBACK_ATTEMPTS: SearchAttempt[] = [
    {
        provider: 'youtube',
        engine: QueryType.YOUTUBE_SEARCH,
    },
    {
        provider: 'spotify',
        engine: SPOTIFY_SEARCH,
    },
    {
        provider: 'soundcloud',
        engine: SOUNDCLOUD_SEARCH,
    },
]

export class SearchEngineManager {
    constructor(private readonly player: Player) {}

    private buildAttempts(options: EnhancedSearchOptions): SearchAttempt[] {
        const preferredEngine = options.preferredEngine ?? QueryType.AUTO
        const preferredProvider = providerFromQueryType(preferredEngine)
        const attempts: SearchAttempt[] = [
            {
                provider: preferredProvider,
                engine: preferredEngine,
            },
        ]

        if (!options.enableFallbacks) {
            return attempts
        }

        const remainingFallbacks = FALLBACK_ATTEMPTS.filter(
            (fallback) =>
                !attempts.some(
                    (candidate) => candidate.provider === fallback.provider,
                ),
        )

        const orderedProviders = providerHealthService.getOrderedProviders(
            remainingFallbacks.map((f) => f.provider),
        )

        for (const provider of orderedProviders) {
            const fallback = remainingFallbacks.find(
                (f) => f.provider === provider,
            )
            if (fallback) attempts.push(fallback)
        }

        return attempts
    }

    private async executeSearchAttempt(
        options: EnhancedSearchOptions,
        attempt: SearchAttempt,
    ): Promise<{ success: boolean; result?: SearchResult; error?: Error }> {
        if (!providerHealthService.isAvailable(attempt.provider)) {
            return { success: false }
        }

        try {
            const result = await this.player.search(options.query, {
                requestedBy: options.requestedBy,
                searchEngine: attempt.engine,
            })

            if (result.tracks.length > 0) {
                providerHealthService.recordSuccess(attempt.provider)
                return { success: true, result }
            }

            providerHealthService.recordFailure(
                attempt.provider,
                Date.now(),
                'No tracks found',
            )
            return { success: false }
        } catch (error) {
            const errorObj = error as Error
            logYouTubeError(errorObj, options.query, options.requestedBy.id)
            providerHealthService.recordFailure(
                attempt.provider,
                Date.now(),
                errorObj.message,
            )
            return { success: false, error: errorObj }
        }
    }

    async performSearch(
        options: EnhancedSearchOptions,
    ): Promise<EnhancedSearchResult> {
        const attempts = this.buildAttempts({
            ...options,
            enableFallbacks: options.enableFallbacks ?? true,
        })
        let executedAttempts = 0
        let lastError: Error | undefined

        for (const attempt of attempts) {
            const result = await this.executeSearchAttempt(options, attempt)
            executedAttempts += 1
            if (result.success && result.result) {
                return {
                    success: true,
                    result: result.result as SearchResult,
                    usedFallback: executedAttempts > 1,
                    attempts: executedAttempts,
                }
            }
            if (result.error) {
                lastError = result.error
            }
        }

        const errorMessage = lastError
            ? createYouTubeErrorMessage(lastError)
            : 'No tracks found for the given query'

        return {
            success: false,
            error: errorMessage,
            attempts: executedAttempts,
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

            const result = await this.performSearch({
                ...options,
                maxRetries: 1,
                enableFallbacks: options.enableFallbacks ?? true,
            })

            if (result.success && result.result) {
                return {
                    success: true,
                    result: result.result as SearchResult,
                    attempts: attempt,
                }
            }

            lastResult = {
                success: false,
                error: result.error ?? 'Search failed',
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
