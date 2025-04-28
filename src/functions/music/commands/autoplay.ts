import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CustomClient } from '@/types';
import Command from '@/models/Command';
import { interactionReply } from '@/handlers/interactionHandler';
import { errorEmbed } from '@/utils/embeds';
import { QueueRepeatMode } from 'discord-player';
import { autoplayEmbed } from '@/utils/embeds';

export default new Command({
    data: new SlashCommandBuilder()
        .setName("autoplay")
        .setDescription("🔄 Ativa ou desativa a reprodução automática de músicas relacionadas."),
    execute: async ({ client, interaction }: { client: CustomClient; interaction: ChatInputCommandInteraction }) => {
        try {
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

            const queue = client.player.nodes.get(interaction.guildId!);

            if (!queue) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [errorEmbed('Fila vazia', 'Não tem nenhuma música tocando no momento.')]
                    }
                });
                return;
            }

            const isAutoplayEnabled = queue.repeatMode === QueueRepeatMode.AUTOPLAY;
            queue.setRepeatMode(isAutoplayEnabled ? QueueRepeatMode.OFF : QueueRepeatMode.AUTOPLAY);

            await interactionReply({
                interaction,
                content: {
                    embeds: [autoplayEmbed(
                        isAutoplayEnabled ? 'Reprodução automática desativada' : 'Reprodução automática ativada',
                        isAutoplayEnabled 
                            ? 'A reprodução automática foi desativada. O bot não irá mais adicionar músicas relacionadas automaticamente.'
                            : 'A reprodução automática foi ativada. O bot irá adicionar músicas relacionadas automaticamente quando a fila estiver vazia.'
                    )]
                }
            });
        } catch (error) {
            console.error('Error in autoplay command:', error);
            await interactionReply({
                interaction,
                content: {
                    embeds: [errorEmbed('Erro', 'Ocorreu um erro ao alterar o modo de reprodução automática.')],
                    ephemeral: true
                }
            });
        }
    }
}); 