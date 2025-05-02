import { SlashCommandBuilder } from '@discordjs/builders';
import Command from '../../../models/Command';
import { interactionReply } from '../../../utils/general/interactionReply';
import { errorEmbed, successEmbed, musicEmbed } from '../../../utils/general/embeds';
import { requireQueue } from '../../../utils/command/commandValidations';
import { CommandExecuteParams } from '../../../types/CommandData';

export default new Command({
    data: new SlashCommandBuilder()
        .setName('jump')
        .setDescription('⏭️ Pula para uma música específica na fila.')
        .addIntegerOption(option => option.setName('posicao').setDescription('Posição da música na fila (1 = próxima)').setRequired(true)),
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        const queue = client.player.nodes.get(interaction.guildId!);
        const pos = interaction.options.getInteger('posicao', true) - 1;

        if (!(await requireQueue(queue, interaction))) return;

        if (queue!.tracks.size === 0) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [errorEmbed('Erro', '🗑️ A fila está vazia!')]
                }
            });
            return;
        }
        if (pos < 0 || pos >= queue!.tracks.size) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [errorEmbed('Erro', '🔄 Posição inválida!')]
                }
            });
            return;
        }

        queue!.node.jump(pos);

        const jumped = queue!.tracks.toArray()[pos];
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    successEmbed('🔄 Pulou para música', `Agora tocando: **${jumped.title}** de ${jumped.author}`),
                    musicEmbed('🎶 Fila de Música', queue!.tracks.map(track => `**${track.title}** de ${track.author}`).join('\n'))
                ]
            }
        });
    }
}); 