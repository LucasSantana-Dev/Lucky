import { Track } from "discord-player";
import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { errorLog } from '../../../../utils/log';
import { searchContentOnYoutube } from '../../../../utils/searchContentOnYoutube';
import { CustomClient } from '../../../../types';

interface Queue {
  addTrack: (track: Track<unknown>) => void;
}

interface SearchTrack {
  title: string;
  url: string;
  thumbnail: string;
  duration: string;
}

interface SearchResult {
  tracks: SearchTrack[];
}

export const handlePlay = async ({ 
  client, 
  interaction, 
  queue, 
  embed 
}: { 
  client: CustomClient; 
  interaction: ChatInputCommandInteraction; 
  queue: Queue; 
  embed: EmbedBuilder;
}) => {
  // Get the query directly from the interaction
  const query = interaction.options.getString("query");

  // Log the query for debugging
  errorLog({message: `Query: ${query}`});

  if (!query) {
    await interaction.editReply({
      embeds: [
        embed
          .setColor("Red")
          .setDescription("❌ Você precisa fornecer um termo de busca ou URL.")
      ]
    });
    return;
  }

  try {
    // Search for the content
    const searchResult = await searchContentOnYoutube({ 
      client, 
      searchTerms: query, 
      interaction 
    });

    if (!searchResult || !searchResult.tracks || searchResult.tracks.length === 0) {
      await interaction.editReply({
        embeds: [
          embed
            .setColor("Red")
            .setDescription("❌ Nenhum resultado encontrado.")
        ]
      });
      return;
    }

    // Add the first track to the queue
    const track = searchResult.tracks[0];
    queue.addTrack({
      title: track.title,
      url: track.url,
      thumbnail: track.thumbnail,
      duration: track.duration
    } as Track);

    // Update the embed with the track information
    embed
      .setColor("Green")
      .setDescription(`✅ Adicionado à fila: **${track.title}**`)
      .setThumbnail(track.thumbnail);

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    errorLog({message: `Error in handlePlay: ${error}`});
    await interaction.editReply({
      embeds: [
        embed
          .setColor("Red")
          .setDescription("❌ Ocorreu um erro ao processar sua solicitação.")
      ]
    });
  }
}; 