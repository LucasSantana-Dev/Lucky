import { SlashCommandBuilder } from '@discordjs/builders';
import Command from '../../../models/Command';
import { interactionReply } from '../../../utils/general/interactionReply';
import { errorEmbed, successEmbed } from '../../../utils/general/embeds';
import { requireGuild, requireQueue, requireCurrentTrack } from '../../../utils/command/commandValidations';
import { CommandExecuteParams } from '../../../types/CommandData';

export default new Command({
    data: new SlashCommandBuilder()
        .setName('remove')
        .setDescription('❌ Remove uma música da fila pelo número.')
        .addIntegerOption(option => option.setName('posicao').setDescription('Posição da música na fila (1 = próxima)').setRequired(true)),
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return;
        const queue = client.player.nodes.get(interaction.guildId!);
        if (!(await requireQueue(queue, interaction))) return;
        if (!(await requireCurrentTrack(queue, interaction))) return;

        const pos = interaction.options.getInteger('posicao', true) - 1;

        if (queue!.tracks.size === 0) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [errorEmbed('Erro', 'A fila está vazia!')]
                }
            });
            return;
        }

        if (pos < 0 || pos >= queue!.tracks.size) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [errorEmbed('Erro', 'Posição inválida!')]
                }
            });
            return;
        }

        const removed = queue!.tracks.toArray()[pos];
        queue!.tracks.remove((_, i) => i === pos);

        await interactionReply({
            interaction,
            content: {
                embeds: [successEmbed('Música removida', `Removida: **${removed.title}** de ${removed.author}`)]
            }
        });
    }
}); 