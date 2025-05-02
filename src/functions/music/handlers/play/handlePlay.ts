import { Track } from "discord-player";
import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { errorLog } from '../../../../utils/general/log';
import { searchContentOnYoutube } from '../../../../utils/search/searchContentOnYoutube';
import { CustomClient } from '../../../../types';
import { messages } from '../../../../utils/general/messages';
import { interactionReply } from '../../../../utils/general/interactionReply';

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
    await interactionReply({
      interaction,
      content: {
        embeds: [
          embed
            .setColor("Red")
            .setDescription(messages.error.noQuery)
        ]
      }
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
      await interactionReply({
        interaction,
        content: {
          embeds: [
            embed
              .setColor("Red")
              .setDescription(messages.error.noResult)
          ]
        }
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

    await interactionReply({
      interaction,
      content: { embeds: [embed] }
    });
  } catch (error) {
    errorLog({message: `Error in handlePlay: ${error}`});
    await interactionReply({
      interaction,
      content: {
        embeds: [
          embed
            .setColor("Red")
            .setDescription(messages.error.generic)
        ]
      }
    });
  }
}; 