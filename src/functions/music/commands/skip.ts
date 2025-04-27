import { SlashCommandBuilder } from '@discordjs/builders';
import { EmbedBuilder, CommandInteraction } from 'discord.js';
import { Player } from 'discord-player';
import Command from '../../../models/Command';

interface Client {
    player: Player;
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName("skip")
        .setDescription("🐇 Pula a próxima musica."),
    execute: async ({ client, interaction }: { client: Client; interaction: CommandInteraction }) => {
        const queue = client.player.nodes.get(interaction.guildId!);

        if (!queue) {
            await interaction.reply("🤔 Não tem nenhuma música tocando no momento.");
            return;
        }

        const currentSong = queue.currentTrack;

        queue.node.skip();

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setDescription(`😜 **${currentSong?.title}** Pulada!`)
                    .setThumbnail(currentSong?.thumbnail || '')
            ]
        });
    }
}); 