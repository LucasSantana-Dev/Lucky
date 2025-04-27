import { SlashCommandBuilder } from '@discordjs/builders';
import Command from '../../../models/Command';
export default new Command({
    data: new SlashCommandBuilder()
        .setName("exit")
        .setDescription("🚪 Sai do canal de voz."),
    execute: async ({ client, interaction }) => {
        const queue = client.player.nodes.get(interaction.guildId);
        if (queue) {
            queue.delete();
            await interaction.reply("😭 Adeeeeus");
        }
        else {
            await interaction.reply("🤔 Não tem nenhuma música tocando no momento.");
        }
    }
});
//# sourceMappingURL=exit.js.map