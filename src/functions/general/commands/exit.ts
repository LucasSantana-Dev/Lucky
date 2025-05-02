import { SlashCommandBuilder } from '@discordjs/builders';
import { debugLog, errorLog, infoLog } from '../../../utils/general/log';
import Command from '../../../models/Command';
import { interactionReply } from '../../../utils/general/interactionReply';
import { errorEmbed, successEmbed } from '../../../utils/general/embeds';
import { requireGuild, requireQueue } from '../../../utils/command/commandValidations';
import { CommandExecuteParams } from '../../../types/CommandData';
import { MessageFlags } from 'discord.js';

export default new Command({
    data: new SlashCommandBuilder()
        .setName('leave')
        .setDescription('🚪 Sai do canal de voz e limpa a fila'),
    
    execute: async ({ client, interaction }: CommandExecuteParams): Promise<void> => {
        if (!(await requireGuild(interaction))) return;

        const queue = client.player.nodes.get(interaction.guildId!);
        if (!(await requireQueue(queue, interaction))) return;

        try {
            infoLog({ message: `Executing leave command for ${interaction.user.tag}` });
            debugLog({ message: 'Exiting voice channel', data: { guildId: interaction.guildId } });
            // Delete the queue and disconnect
            queue!.delete();
            await interactionReply({
                interaction,
                content: {
                    embeds: [successEmbed('👋 Até logo!', 'Desconectei do canal de voz e limpei a fila.')],
                },
            });
        } catch (error) {
            errorLog({ message: 'Error in leave command:', error });
            await interactionReply({
                interaction,
                content: {
                    embeds: [errorEmbed('Erro', 'Ocorreu um erro ao tentar sair do canal de voz!')],
                }
            });
        }
    }
}); 