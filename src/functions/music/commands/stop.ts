import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CustomClient } from '@/types';
import Command from '@/models/Command';
import { interactionReply } from '@/handlers/interactionHandler';

export default new Command({
    data: new SlashCommandBuilder()
        .setName("stop")
        .setDescription("⏹️ Para a reprodução e limpa a fila."),
    execute: async ({ client, interaction }: { client: CustomClient; interaction: ChatInputCommandInteraction }) => {
        const queue = client.player.nodes.get(interaction.guildId!);

        if (!queue) {
            await interactionReply({
                interaction,
                content: {
                    content: "🤔 Não tem nenhuma música tocando no momento."
                }
            });
            return;
        }

        queue.delete();

        await interactionReply({
            interaction,
            content: {
                content: "⏹️ A reprodução foi interrompida e a fila foi limpa."
            }
        });
    }
}); 