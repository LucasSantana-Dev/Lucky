import { SlashCommandBuilder } from '@discordjs/builders';
import { debugLog, errorLog } from '../../../utils/general/log';
import Command from '../../../models/Command';
import { interactionReply } from '../../../utils/general/interactionReply';
import { errorEmbed, successEmbed } from '../../../utils/general/embeds';
import {
    requireGuild,
    requireQueue,
    requireCurrentTrack,
    requireIsPlaying
} from '../../../utils/command/commandValidations';
import { CommandExecuteParams } from '../../../types/CommandData';

export default new Command({
    data: new SlashCommandBuilder()
        .setName("skip")
        .setDescription("⏭️ Pula a música atual."),
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return;
        
        const queue = client.player.nodes.get(interaction.guildId!);

        if (!(await requireQueue(queue, interaction))) return;
        if (!(await requireCurrentTrack(queue, interaction))) return;
        if (!(await requireIsPlaying(queue, interaction))) return;

        if (!queue!.isPlaying()) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [errorEmbed('Erro', '🤔 Não há música tocando no momento.')]
                }
            });
            return;
        }

        try {
            // Skip the current song using skip() instead of stop()
            // This ensures autoplay continues to work properly
            queue!.node.skip();
            
            debugLog({ message: `Skipped current song in guild ${interaction.guildId}` });

            // Ensure playback continues if there are tracks left
            setTimeout(async () => {
                if (!queue!.isPlaying() && queue!.tracks.size > 0) {
                    await queue!.node.play();
                }
            }, 500);

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