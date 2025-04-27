import { QueryType } from "discord-player";
import { errorLog, debugLog } from './log';
export const searchContentOnYoutube = async ({ client, searchTerms, interaction, isPlaylist = false }) => {
    try {
        debugLog({ message: `Searching for: ${searchTerms}` });
        // Try YouTube search first
        const result = await client.player.search(searchTerms, {
            requestedBy: interaction.user,
            searchEngine: isPlaylist ? QueryType.YOUTUBE_PLAYLIST : QueryType.YOUTUBE_SEARCH,
        });
        debugLog({ message: `Search result: ${result ? 'Found' : 'Not found'}` });
        // If no results, try AUTO search as fallback
        if (!result || !result.tracks || result.tracks.length === 0) {
            debugLog({ message: 'No results with YouTube search, trying AUTO search' });
            return await client.player.search(searchTerms, {
                requestedBy: interaction.user,
                searchEngine: QueryType.AUTO,
            });
        }
        return result;
    }
    catch (error) {
        errorLog({ message: `Error searching for content: ${error}` });
        throw error;
    }
};
//# sourceMappingURL=searchContentOnYoutube.js.map