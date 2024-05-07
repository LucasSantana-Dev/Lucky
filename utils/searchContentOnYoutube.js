import { QueryType } from "discord-player";

export const searchContentOnYoutube = async ({ client, searchTerms, interaction, isPlaylist }) => {
  const result = await client.player.search(searchTerms, {
    requestedBy: interaction.user,
    searchEngine: isPlaylist ? QueryType.YOUTUBE_PLAYLIST : QueryType.AUTO,
  });

  return result
}