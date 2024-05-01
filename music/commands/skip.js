const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require("discord.js");
const { Command } = require('../../utils/Command.js');

module.exports = new Command({
    data: new SlashCommandBuilder()
        .setName("skip")
        .setDescription("🐇 Pula a próxima musica."),
    execute: async ({ client, interaction }) => {
        const queue = client.player.getQueue(interaction.guild);

        if (!queue) {
            await interaction.reply("🤔 Não tem nenhuma música tocando no momento.");
            return;
        }

        const currentSong = queue.current;

        queue.skip();

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setDescription(`😜 **${currentSong.title}** Pulada!`)
                    .setThumbnail(currentSong.thumbnail)
            ]
        });
    }
});
