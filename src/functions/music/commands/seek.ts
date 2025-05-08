import { SlashCommandBuilder } from '@discordjs/builders';
import Command from '../../../models/Command';
import { interactionReply } from '../../../utils/general/interactionReply';
import { errorEmbed, successEmbed } from '../../../utils/general/embeds';
import { requireGuild, requireQueue, requireCurrentTrack, requireIsPlaying } from '../../../utils/command/commandValidations';
import { CommandExecuteParams } from '../../../types/CommandData';

function parseTime(time: string): number | null {
    const parts = time.split(':').map(Number);
    if (parts.length === 1 && !isNaN(parts[0])) return parts[0];
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) return parts[0] * 60 + parts[1];
    return null;
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('seek')
        .setDescription('⏩ Vai para um tempo específico da música atual.')
        .addStringOption(option => option.setName('tempo').setDescription('Tempo (mm:ss ou ss)').setRequired(true)),
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return;

        const queue = client.player.nodes.get(interaction.guildId!);
        if (!(await requireQueue(queue, interaction))) return;

        if (!(await requireCurrentTrack(queue, interaction))) return;

        if (!(await requireIsPlaying(queue, interaction))) return;

        const timeStr = interaction.options.getString('tempo', true);
        const seconds = parseTime(timeStr);
        if (seconds === null || seconds < 0 || seconds > queue!.currentTrack!.durationMS / 1000) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [errorEmbed('Erro', '⏱️ Tempo inválido!')]
                }
            });
            return;
        }
        await queue!.node.seek(seconds * 1000);
        await interactionReply({
            interaction,
            content: {
                embeds: [successEmbed('Tempo alterado', `⏩ Avançado para ${timeStr}`)]
            }
        });
    }
}); 