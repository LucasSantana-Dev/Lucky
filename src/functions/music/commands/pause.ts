import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CustomClient } from '@/types';
import Command from '@/models/Command';
import { interactionReply } from '@/handlers/interactionHandler';

export default new Command({
    data: new SlashCommandBuilder()
        .setName("pause")
        .setDescription("⏸️ Pausa a música atual."),
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

        if (queue.node.isPaused()) {
            await interactionReply({
                interaction,
                content: {
                    content: "⏸️ A música já está pausada."
                }
            });
            return;
        }

        queue.node.pause();

        await interactionReply({
            interaction,
            content: {
                content: "⏸️ A música foi pausada."
            }
        });
    }
}); 