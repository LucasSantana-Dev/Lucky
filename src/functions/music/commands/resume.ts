import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CustomClient } from '@/types';
import Command from '@/models/Command';
import { interactionReply } from '@/handlers/interactionHandler';

export default new Command({
    data: new SlashCommandBuilder()
        .setName("resume")
        .setDescription("▶️ Retoma a música pausada."),
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

        if (!queue.node.isPaused()) {
            await interactionReply({
                interaction,
                content: {
                    content: "▶️ A música já está tocando."
                }
            });
            return;
        }

        queue.node.resume();

        await interactionReply({
            interaction,
            content: {
                content: "▶️ A música foi retomada."
            }
        });
    }
}); 