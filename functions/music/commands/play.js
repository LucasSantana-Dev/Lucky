import { SlashCommandBuilder } from '@discordjs/builders';
import { EmbedBuilder } from "discord.js";
import Command from '../../../models/Command.js';
import { handlePlay } from '../handlers/play/handlePlay.js';
import { createQueue, queueConnect } from '../../../handlers/queueHandler.js';

export default new Command({
    data:
        new SlashCommandBuilder()
            .setName("play")
            .setDescription("▶️ Toca uma música ou uma playlist")
            .addStringOption(option =>
                option
                    .setName("pesquisa")
                    .setDescription("Termos de pesquisa")
            )
            .addStringOption(option =>
                option
                    .setName("playlist")
                    .setDescription("URL da Playlist")
            )
            .addStringOption(option =>
                option
                    .setName("url")
                    .setDescription("URL da Música")
            ),
    execute: async ({ client, interaction }) => {
        if (!interaction.member.voice.channel) {
            await interaction.reply("🤨 Você deve estar em um canal de voz para usar esse comando.");
            return;
        }

        const queue = await createQueue({ client, interaction });

        await queueConnect({ queue, interaction })

        let embed = new EmbedBuilder();

        await handlePlay({ client, interaction, queue, embed });

        if (!queue.playing) await queue.play();
        queue.setVolume(50);

        await interaction.reply({
            embeds: [embed]
        });
    }
});
