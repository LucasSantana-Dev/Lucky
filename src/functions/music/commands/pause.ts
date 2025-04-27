import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, EmbedBuilder } from 'discord.js';
import Command from '../../../models/Command';
import { CustomClient } from '../../../types/index';
import { useTimeline } from 'discord-player';

export default new Command({
  data: new SlashCommandBuilder()
    .setName("pause")
    .setDescription("✋ Pausa a musica atual."),
  execute: async ({ client, interaction }: { client: CustomClient; interaction: CommandInteraction }) => {
    if (!interaction.guildId) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#FF0000')
            .setDescription('❌ This command can only be used in a server!')
        ],
        ephemeral: true
      });
      return;
    }

    const timeline = useTimeline()


    if (!timeline) {
      await interaction.reply("🤔 Não tem nenhuma música tocando no momento.");
      return;
    }

    const wasPaused = timeline.paused;

    wasPaused ? timeline.resume() : timeline.pause();

    await interaction.reply(`⏸ A música atual foi ${wasPaused ? 'pausada' : 'retomada'}.`);
  }
}); 