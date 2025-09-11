import type { ChatInputCommandInteraction } from "discord.js"
import type { ICustomClient } from "../../types"
import { errorLog, debugLog } from "../general/log"
import {
    enhancedYouTubeSearch,
    enhancedAutoSearch,
} from "../music/enhancedSearch"
import {
    logYouTubeError,
    isRecoverableYouTubeError,
} from "../music/youtubeErrorHandler"
import { YouTubeError } from "../../types/errors"

interface ISearchContentParams {
    client: ICustomClient
    searchTerms: string
    interaction: ChatInputCommandInteraction
    isPlaylist?: boolean
}

export const searchContentOnYoutube = async ({
    client,
    searchTerms,
    interaction,
    isPlaylist = false,
}: ISearchContentParams) => {
    try {
        debugLog({ message: `Searching for: ${searchTerms}` })

        // Use enhanced search for better error handling
        const enhancedResult = await enhancedYouTubeSearch(
            client.player,
            searchTerms,
            interaction.user,
            isPlaylist,
        )

        if (enhancedResult.success && enhancedResult.result) {
            debugLog({
                message: `Search result: Found ${enhancedResult.result.tracks.length} tracks`,
            })
            return enhancedResult.result
        }

        // If enhanced search failed, try auto search as final fallback
        debugLog({
            message:
                "Enhanced YouTube search failed, trying AUTO search as final fallback",
        })

        const autoResult = await enhancedAutoSearch(
            client.player,
            searchTerms,
            interaction.user,
        )

        if (autoResult.success && autoResult.result) {
            debugLog({
                message: `Auto search result: Found ${autoResult.result.tracks.length} tracks`,
            })
            return autoResult.result
        }

        // If all searches failed, throw the error from enhanced search
        throw new YouTubeError(enhancedResult.error ?? "No results found", {
            guildId: interaction.guild?.id,
            userId: interaction.user.id,
            query: searchTerms,
            originalError: enhancedResult.error,
        })
    } catch (error) {
        const errorObj = error as Error

        // Log YouTube-specific errors with enhanced logging
        if (isRecoverableYouTubeError(errorObj)) {
            logYouTubeError(errorObj, "searchContentOnYoutube")
        } else {
            errorLog({
                message: `Error searching for content: ${errorObj.message}`,
            })
        }

        throw error
    }
}
