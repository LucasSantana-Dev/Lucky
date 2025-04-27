import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { CustomClient } from '../../../types/index';
import Command from '../../../models/Command';

const command = new Command({
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop playing music and clear the queue') as SlashCommandBuilder,
    execute: async ({ client, interaction }: { client: CustomClient; interaction: ChatInputCommandInteraction }): Promise<void> => {
        if (!interaction.guildId) {
            await interaction.reply({ content: 'This command can only be used in a server!', ephemeral: true });
            return;
        }

        const member = interaction.member as GuildMember;
        if (!member.voice.channel) {
            await interaction.reply({ content: 'You need to be in a voice channel!', ephemeral: true });
            return;
        }

        const queue = client.player.nodes.get(interaction.guildId);

        if (!queue || !queue.isPlaying()) {
            await interaction.reply({ content: 'There is no song playing!', ephemeral: true });
            return;
        }

        try {
            queue.delete();
            await interaction.reply('⏹️ Stopped the music and cleared the queue!');
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'There was an error while trying to stop the music!', ephemeral: true });
        }
    }
});

export default command; 