import type { ChatInputCommandInteraction, User } from 'discord.js'
import type { CustomClient } from '../../types'
import type { SearchResult } from 'discord-player'
import { errorLog, debugLog } from '../general/log'
import {
    enhancedYouTubeSearch,
    enhancedAutoSearch,
} from '../music/enhancedSearch'
import {
    logYouTubeError,
    isRecoverableYouTubeError,
} from '../music/youtubeErrorHandler'
// import { YouTubeErrorCode } from "../../types/errors" // Unused

type SearchContentParams = {
    client: CustomClient
    searchTerms: string
    interaction: ChatInputCommandInteraction
    isPlaylist?: boolean
}

async function performEnhancedSearch(
    client: CustomClient,
    searchTerms: string,
    user: User,
    isPlaylist: boolean,
): Promise<SearchResult | null> {
    const enhancedResult = await enhancedYouTubeSearch(
        client.player,
        searchTerms,
        user,
        isPlaylist,
    )

    if (enhancedResult.success && enhancedResult.result) {
        debugLog({
            message: `Search result: Found ${enhancedResult.result.tracks.length} tracks`,
        })
        return enhancedResult.result
    }

    return null
}

async function performAutoSearch(
    client: CustomClient,
    searchTerms: string,
    user: User,
): Promise<SearchResult | null> {
    const autoResult = await enhancedAutoSearch(
        client.player,
        searchTerms,
        user,
    )

    if (autoResult.success && autoResult.result) {
        debugLog({
            message: `Auto search result: Found ${autoResult.result.tracks.length} tracks`,
        })
        return autoResult.result
    }

    return null
}

function handleSearchError(
    error: Error,
    _searchTerms: string,
    _guildId: string | undefined,
    _userId: string,
): void {
    if (isRecoverableYouTubeError(error)) {
        logYouTubeError(error, 'searchContentOnYoutube', 'unknown')
    } else {
        errorLog({
            message: `Error searching for content: ${error.message}`,
        })
    }
}

export const searchContentOnYoutube = async ({
    client,
    searchTerms,
    interaction,
    isPlaylist = false,
}: SearchContentParams) => {
    try {
        debugLog({ message: `Searching for: ${searchTerms}` })

        const enhancedResult = await performEnhancedSearch(
            client,
            searchTerms,
            interaction.user,
            isPlaylist,
        )

        if (enhancedResult) {
            return enhancedResult
        }

        debugLog({
            message:
                'Enhanced YouTube search failed, trying AUTO search as final fallback',
        })

        const autoResult = await performAutoSearch(
            client,
            searchTerms,
            interaction.user,
        )

        if (autoResult) {
            return autoResult
        }

        throw new Error('No results found')
    } catch (error) {
        const errorObj = error as Error
        handleSearchError(
            errorObj,
            searchTerms,
            interaction.guild?.id,
            interaction.user.id,
        )
        throw error
    }
}
