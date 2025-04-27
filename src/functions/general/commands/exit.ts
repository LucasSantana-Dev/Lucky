import { SlashCommandBuilder } from '@discordjs/builders';
import { Client, ChatInputCommandInteraction } from 'discord.js';
import { Player } from 'discord-player';
import Command from '../../../models/Command';

interface CustomClient extends Client {
    player: Player;
}

interface CommandExecuteParams {
    client: CustomClient;
    interaction: ChatInputCommandInteraction;
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName("exit")
        .setDescription("🚪 Sai do canal de voz."),
    execute: async ({ client, interaction }: CommandExecuteParams): Promise<void> => {
        const queue = client.player.nodes.get(interaction.guildId!);

        if (queue) {
            queue.delete();
            await interaction.reply("😭 Adeeeeus");
        } else {
            await interaction.reply("🤔 Não tem nenhuma música tocando no momento.");
        }
    }
}); 