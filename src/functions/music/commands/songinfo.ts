import { SlashCommandBuilder } from '@discordjs/builders';
import Command from '../../../models/Command';
import { interactionReply } from '../../../utils/general/interactionReply';
import { musicEmbed } from '../../../utils/general/embeds';
import { CommandExecuteParams } from '../../../types/CommandData';
import { requireQueue, requireCurrentTrack } from '../../../utils/command/commandValidations';

export default new Command({
    data: new SlashCommandBuilder()
        .setName('songinfo')
        .setDescription('🎶 Mostra informações da música que está tocando agora.'),
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        const queue = client.player.nodes.get(interaction.guildId!);
        const track = queue?.currentTrack;

        if (!(await requireQueue(queue, interaction))) return;
        if (!(await requireCurrentTrack(queue, interaction))) return;

        // Try to get the current playback timestamp
        let timeLeftText = '';
        if (queue && queue.node && typeof queue.node.getTimestamp === 'function') {
            const ts = queue.node.getTimestamp();
            if (ts && typeof ts.current === 'number' && typeof ts.total === 'number') {
                const secondsLeft = Math.max(0, ts.total - ts.current);
                const minutes = Math.floor(secondsLeft / 60);
                const seconds = secondsLeft % 60;
                timeLeftText = `\nTempo restante: **${minutes}:${seconds.toString().padStart(2, '0')}**`;
            }
        }
        const embed = musicEmbed('Tocando Agora', `[**${track!.title}**](${track!.url})\nAutor: **${track!.author}**\nDuração: **${track!.duration}**\nSolicitado por: **${track!.requestedBy?.username || 'Desconhecido'}**${timeLeftText}`);
        
        if (track!.thumbnail) embed.setThumbnail(track!.thumbnail);

        await interactionReply({
            interaction,
            content: { embeds: [embed] }
        });
    }
}); 