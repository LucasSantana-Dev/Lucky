import { SlashCommandBuilder } from '@discordjs/builders';
import Command from '../../../models/Command';
export default new Command({
    data: new SlashCommandBuilder()
        .setName("resume")
        .setDescription("✋ Volta a tocar a musica atual."),
    execute: async ({ client, interaction }) => {
        const queue = client.player.nodes.get(interaction.guildId);
        if (!queue) {
            await interaction.reply("🤔 Não tem nenhuma música tocando no momento.");
            return;
        }
        queue.node.resume();
        await interaction.reply("⏸ A música atual voltou a tocar.");
    }
});
//# sourceMappingURL=resume.js.map