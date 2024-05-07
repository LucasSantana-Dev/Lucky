import { SlashCommandBuilder } from '@discordjs/builders';
import Command from '../../utils/Command.js';

export default new Command({
    data: new SlashCommandBuilder()
        .setName("exit")
        .setDescription("🚪 Sai do canal de voz."),
    execute: async ({ client, interaction }) => {
        const queue = client.player.getQueue(interaction.guild);

        queue.destroy();

        await interaction.reply("😭 Adeeeeus");
    }
});
