import { SlashCommandBuilder } from '@discordjs/builders';
import { errorEmbed, successEmbed } from '../../../utils/general/embeds';
import { interactionReply } from '../../../utils/general/interactionReply';
import { debugLog } from '../../../utils/general/log';
import Command from '../../../models/Command';
import { requireGuild, requireQueue } from '../../../utils/command/commandValidations';
import { CommandExecuteParams } from '../../../types/CommandData';

export default new Command({
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('🗑️ Limpa a fila de músicas'),
  
  execute: async ({ client, interaction }: CommandExecuteParams): Promise<void> => {
    if (!(await requireGuild(interaction))) return;

    const queue = client.player.nodes.get(interaction.guildId!);
    if (!(await requireQueue(queue, interaction))) return;

    try {
      // Check if the queue is already empty
      if (queue!.tracks.size === 0) {
        await interactionReply({
          interaction,
          content: {
            embeds: [errorEmbed('Fila vazia', '🗑️ A fila já está vazia!')],
            ephemeral: true
          }
        });
        return;
      }

      // Get the number of tracks before clearing
      const trackCount = queue!.tracks.size;
      
      // Clear the queue
      queue!.clear();
      
      debugLog({ message: `Cleared ${trackCount} tracks from queue in guild ${interaction.guildId}` });
      
      // Send success message
      await interactionReply({
        interaction,
        content: {
          embeds: [successEmbed('Fila limpa', `🗑️ Removidas ${trackCount} músicas da fila!`)]
        }
      });
    } catch (error) {
      console.error('Error in clear command:', error);
      await interactionReply({
        interaction,
        content: {
          embeds: [errorEmbed('Erro', '🔄 Ocorreu um erro ao limpar a fila!')],
          ephemeral: true
        }
      });
    }
  }
}); 