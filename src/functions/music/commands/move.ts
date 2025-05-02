import { SlashCommandBuilder } from '@discordjs/builders';
import Command from '../../../models/Command';
import { interactionReply } from '../../../utils/general/interactionReply';
import { errorEmbed, successEmbed } from '../../../utils/general/embeds';
import { requireGuild, requireQueue, requireCurrentTrack } from '../../../utils/command/commandValidations';
import { CommandExecuteParams } from '../../../types/CommandData';

export default new Command({
    data: new SlashCommandBuilder()
        .setName('move')
        .setDescription('🔀 Move uma música para outra posição na fila.')
        .addIntegerOption(option => option.setName('de').setDescription('Posição atual (1 = próxima)').setRequired(true))
        .addIntegerOption(option => option.setName('para').setDescription('Nova posição (1 = próxima)').setRequired(true)),
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return;
        const queue = client.player.nodes.get(interaction.guildId!);
        if (!(await requireQueue(queue, interaction))) return;
        if (!(await requireCurrentTrack(queue, interaction))) return;

        const from = interaction.options.getInteger('de', true) - 1;
        const to = interaction.options.getInteger('para', true) - 1;

        if (queue!.tracks.size === 0) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [errorEmbed('Erro', 'A fila está vazia!')]
                }
            });
            return;
        }

        if (from < 0 || from >= queue!.tracks.size || to < 0 || to >= queue!.tracks.size) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [errorEmbed('Erro', 'Posição inválida!')]
                }
            });
            return;
        }

        const tracks = queue!.tracks.toArray();
        const [moved] = tracks.splice(from, 1);
        tracks.splice(to, 0, moved);
        queue!.tracks.clear();
        queue!.tracks.add(tracks);

        await interactionReply({
            interaction,
            content: {
                embeds: [successEmbed('Música movida', `Movida: **${moved.title}** para a posição ${to + 1}`)]
            }
        });
    }
}); 