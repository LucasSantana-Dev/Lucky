import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CustomClient } from '../../../types';
import Command from '../../../models/Command';
import { infoLog } from '../../../utils/log';

const command = new Command({
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong!'),
  
  execute: async ({ interaction, client }: { interaction: ChatInputCommandInteraction, client: CustomClient }): Promise<void> => {
    infoLog({ message: `Executing ping command for ${interaction.user.tag}` });
    await interaction.reply({ content: 'Pong!', ephemeral: true });
  }
});

export default command;

