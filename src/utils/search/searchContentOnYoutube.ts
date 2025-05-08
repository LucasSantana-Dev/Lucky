import { QueryType } from "discord-player";
import { ChatInputCommandInteraction } from 'discord.js';
import { CustomClient } from '../../types';
import { errorLog, debugLog } from '../general/log';

interface SearchContentParams {
  client: CustomClient;
  searchTerms: string;
  interaction: ChatInputCommandInteraction;
  isPlaylist?: boolean;
}

export const searchContentOnYoutube = async ({ 
  client, 
  searchTerms, 
  interaction, 
  isPlaylist = false 
}: SearchContentParams) => {
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
  } catch (error) {
    errorLog({ message: `Error searching for content: ${error}` });
    throw error;
  }
} 