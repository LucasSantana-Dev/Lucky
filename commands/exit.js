import { SlashCommandBuilder } from '@discordjs/builders'
import { Command } from './utils/Command.js';

export default new Command({
    data: new SlashCommandBuilder()
        .setName("exit")
        .setDescription("🚪 Sai do canal de voz."),
    execute: async ({ client, interaction }) => {
        const queue = client.player.getQueue(interaction.guild);

        if (!queue) {
            await interaction.reply("🤔 Não tem nenhuma música tocando no momento.")
            return;
        }

        queue.destroy();

        await interaction.reply("😭 Adeeeeus")
    }
})