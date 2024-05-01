const { SlashCommandBuilder } = require('@discordjs/builders');
const { Command } = require('../../utils/Command.js');

module.exports = new Command({
    data: new SlashCommandBuilder()
        .setName("pause")
        .setDescription("✋ Pausa a musica atual."),
    execute: async ({ client, interaction }) => {
        const queue = client.player.getQueue(interaction.guild);

        if (!queue) {
            await interaction.reply("🤔 Não tem nenhuma música tocando no momento.");
            return;
        }

        queue.setPaused(true);

        await interaction.reply("⏸ A música atual foi pausada.");
    }
});
