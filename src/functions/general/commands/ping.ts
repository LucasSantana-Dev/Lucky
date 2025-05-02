import { SlashCommandBuilder } from '@discordjs/builders';
import Command from '../../../models/Command';
import { infoLog } from '../../../utils/general/log';
import { interactionReply } from '../../../utils/general/interactionReply';

export default new Command({
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('🏓 Mostra o ping do bot.'),
  
  execute: async ({ interaction }) => {
    infoLog({ message: `Executing ping command for ${interaction.user.tag}` });
    
    await interactionReply({
      interaction,
      content: {
        content: '🏓 Pinging...'
      }
    });
    const sent = await interaction.fetchReply();
    const latency = (sent as any).createdTimestamp - interaction.createdTimestamp;
    const apiLatency = Math.round(interaction.client.ws.ping);
    
    await interactionReply({
      interaction,
      content: {
        content: `🏓 Pong!\nLatência: ${latency}ms\nAPI Latência: ${apiLatency}ms`
      }
    });
  }
});

