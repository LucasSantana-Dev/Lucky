import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CustomClient } from '@/types';
import { debugLog, errorLog, infoLog } from '@utils/log';
import Command from '@models/Command';
import { interactionReply } from '@utils/interactionReply';
import { errorEmbed, successEmbed } from '@utils/embeds';

export default new Command({
    data: new SlashCommandBuilder()
        .setName('leave')
        .setDescription('🚪 Sai do canal de voz e limpa a fila'),
    
    execute: async ({ client, interaction }: { client: CustomClient; interaction: ChatInputCommandInteraction }): Promise<void> => {
        try {
            infoLog({ message: `Executing leave command for ${interaction.user.tag}` });
            
            if (!interaction.guildId) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [errorEmbed('Erro', 'Este comando só pode ser usado em um servidor!')],
                        ephemeral: true
                    }
                });
                return;
            }

            const queue = client.player.nodes.get(interaction.guildId);
            if (!queue) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [errorEmbed('Erro', 'Não estou em um canal de voz!')],
                        ephemeral: true
                    }
                });
                return;
            }

            debugLog({ message: 'Exiting voice channel', data: { guildId: interaction.guildId } });

            // Delete the queue and disconnect
            queue.delete();

            await interactionReply({
                interaction,
                content: {
                    embeds: [successEmbed('👋 Até logo!', 'Desconectei do canal de voz e limpei a fila.')]
                }
            });
        } catch (error) {
            errorLog({ message: 'Error in leave command:', error });
            await interactionReply({
                interaction,
                content: {
                    embeds: [errorEmbed('Erro', 'Ocorreu um erro ao tentar sair do canal de voz!')],
                    ephemeral: true
                }
            });
        }
    }
}); 