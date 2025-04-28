import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CustomClient } from '@/types';
import { errorEmbed, successEmbed } from '@/utils/embeds';
import { interactionReply } from '@/utils/interactionReply';
import { debugLog } from '@/utils/log';
import Command from '@/models/Command';

export default new Command({
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('🗑️ Limpa a fila de músicas'),
  
  execute: async ({ client, interaction }: { client: CustomClient; interaction: ChatInputCommandInteraction }): Promise<void> => {
    try {
      if (!interaction.guildId) {
        await interactionReply({
          interaction,
          content: {
            embeds: [errorEmbed('Erro', 'Este comando só pode ser usado em um servidor!')],
            ephemeral: true
          }
        });
        return;
      }

      const queue = client.player.nodes.get(interaction.guildId);
      
      if (!queue) {
        await interactionReply({
          interaction,
          content: {
            embeds: [errorEmbed('Fila vazia', 'Não há música tocando no momento!')],
            ephemeral: true
          }
        });
        return;
      }

      // Check if the queue is already empty
      if (queue.tracks.size === 0) {
        await interactionReply({
          interaction,
          content: {
            embeds: [errorEmbed('Fila vazia', 'A fila já está vazia!')],
            ephemeral: true
          }
        });
        return;
      }

      // Get the number of tracks before clearing
      const trackCount = queue.tracks.size;
      
      // Clear the queue
      queue.clear();
      
      debugLog({ message: `Cleared ${trackCount} tracks from queue in guild ${interaction.guildId}` });
      
      // Send success message
      await interactionReply({
        interaction,
        content: {
          embeds: [successEmbed('Fila limpa', `Removidas ${trackCount} músicas da fila!`)]
        }
      });
    } catch (error) {
      console.error('Error in clear command:', error);
      await interactionReply({
        interaction,
        content: {
          embeds: [errorEmbed('Erro', 'Ocorreu um erro ao limpar a fila!')],
          ephemeral: true
        }
      });
    }
  }
}); 