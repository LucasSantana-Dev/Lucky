import { SlashCommandBuilder } from '@discordjs/builders';
import { EmbedBuilder } from "discord.js";
import Command from '../../../models/Command.js';

export default new Command({
    data: new SlashCommandBuilder()
        .setName("queue")
        .setDescription("👀 Mostra as 10 primeiras músicas da fila."),
    execute: async ({ client, interaction }) => {
        const queue = client.player.getQueue(interaction.guild);

        if (!queue || !queue.playing) {
            await interaction.reply("🤨 Não tem nenhuma música tocando.");
            return;
        }

        const queueString = queue.tracks.slice(0, 10).map((song, i) => {
            return `${i + 1}) [${song.duration}]\` ${song.title} - <@${song.requestedBy.id}>`;
        }).join('\n');

        const currentSong = queue.current;

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setDescription(`**Atualmente tocando:**\n\` ${currentSong.title} - <@${currentSong.requestedBy.id}>\n\n**Fila:**\n${queueString}`)
                    .setThumbnail(currentSong.thumbnail)
            ]
        });
    }
});
