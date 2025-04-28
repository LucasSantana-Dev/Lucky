import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CustomClient } from '@/types';
import { debugLog, errorLog } from '@/utils/log';
import Command from '@/models/Command';
import { interactionReply } from '@/handlers/interactionHandler';
import { errorEmbed, successEmbed } from '@/utils/embeds';

export default new Command({
    data: new SlashCommandBuilder()
        .setName("skip")
        .setDescription("⏭️ Pula a música atual."),
    execute: async ({ client, interaction }: { client: CustomClient; interaction: ChatInputCommandInteraction }) => {
        try {
            if (!interaction.guildId) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [errorEmbed('Erro', 'Este comando só pode ser usado em um servidor!')]
                    }
                });
                return;
            }

            const queue = client.player.nodes.get(interaction.guildId);

            if (!queue) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [errorEmbed('Fila vazia', 'Não tem nenhuma música tocando no momento.')]
                    }
                });
                return;
            }

            if (!queue.isPlaying()) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [errorEmbed('Erro', 'Não há música tocando no momento.')]
                    }
                });
                return;
            }

            // Skip the current song using skip() instead of stop()
            // This ensures autoplay continues to work properly
            queue.node.skip();
            
            debugLog({ message: `Skipped current song in guild ${interaction.guildId}` });

            await interactionReply({
                interaction,
                content: {
                    embeds: [successEmbed('⏭️ Música pulada', 'A música atual foi pulada.')]
                }
            });
        } catch (error) {
            errorLog({ message: 'Error in skip command:', error });
            await interactionReply({
                interaction,
                content: {
                    embeds: [errorEmbed('Erro', 'Ocorreu um erro ao tentar pular a música.')]
                }
            });
        }
    }
}); 