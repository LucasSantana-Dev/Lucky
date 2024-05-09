import { errorLog } from "../../../../utils/log.js";
import { searchContentOnYoutube } from "../../../../utils/searchContentOnYoutube.js";

export const handlePlay = async ({ client, interaction, queue, embed }) => {
  let searchTerms = interaction.options.getString("pesquisa");
  let playlistUrl = interaction.options.getString("playlist");
  let songUrl = interaction.options.getString("url");

  let isPlaylist = false;

  if (!searchTerms && !playlistUrl && !songUrl) {
    await interaction.reply("🤔 Você deve fornecer um termo de pesquisa, uma URL de playlist ou uma URL de música.");
    return errorLog({message: 'No search terms, playlist URL or song URL provided.'});
  }

  if (playlistUrl) {
    isPlaylist = true;
  }

  const result = await searchContentOnYoutube({ client, searchTerms, interaction, isPlaylist });

  if (result.tracks.length === 0) {
    await interaction.reply("🥱 Nenhum resultado encontrado.");
    return;
  }

  const firstContentFound = result.tracks[0];
  await queue.addTrack(firstContentFound);

  embed
    .setDescription(`😏 **[${firstContentFound.title}](${firstContentFound.url})** Adicionada à fila.`)
    .setThumbnail(firstContentFound.thumbnail)
    .setFooter({ text: `Duração: ${firstContentFound.duration}\nAdicionada à fila por: ${interaction.user}` });
}