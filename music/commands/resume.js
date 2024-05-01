const { SlashCommandBuilder } = require('@discordjs/builders');
const Command = require('../../utils/Command.js');

module.exports = new Command({
    data: new SlashCommandBuilder()
        .setName("resume")
        .setDescription("✋ Volta a tocar a musica atual."),
    execute: async ({ client, interaction }) => {
        const queue = client.player.getQueue(interaction.guild);

        if (!queue) {
            await interaction.reply("🤔 Não tem nenhuma música tocando no momento.");
            return;
        }

        queue.setPaused(false);

        await interaction.reply("⏸ A música atual voltou a tocar.");
    }
});
