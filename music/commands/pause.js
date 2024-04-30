import { SlashCommandBuilder } from '@discordjs/builders'
import { Command } from '../../utils/Command.js';

export default new Command({
    data: new SlashCommandBuilder()
        .setName("pause")
        .setDescription("✋ Pausa a musica atual."),
    execute: async ({ client, interaction }) => {
        const queue = client.player.getQueue(interaction.guild);

        if (!queue) {
            await interaction.reply("🤔 Não tem nenhuma música tocando no momento.")
            return;
        }

        queue.setPaused(true);

        await interaction.reply("⏸ A música atual foi pausada.")
    }
})