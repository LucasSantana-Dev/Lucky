import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CustomClient } from '@/types';
import Command from '@/models/Command';
import { infoLog } from '@/utils/log';

export default new Command({
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('🏓 Mostra o ping do bot.'),
  
  execute: async ({ interaction, client }: { interaction: ChatInputCommandInteraction, client: CustomClient }): Promise<void> => {
    infoLog({ message: `Executing ping command for ${interaction.user.tag}` });
    
    const sent = await interaction.reply({ content: '🏓 Pinging...', fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const apiLatency = Math.round(interaction.client.ws.ping);
    
    await interaction.editReply(`🏓 Pong!\nLatência: ${latency}ms\nAPI Latência: ${apiLatency}ms`);
  }
});

