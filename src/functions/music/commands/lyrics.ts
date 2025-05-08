import { SlashCommandBuilder } from '@discordjs/builders';
import Command from '../../../models/Command';
import { interactionReply } from '../../../utils/general/interactionReply';
import { musicEmbed } from '../../../utils/general/embeds';
import { CommandExecuteParams } from '../../../types/CommandData';
import { requireCurrentTrack } from '../../../utils/command/commandValidations';

export default new Command({
    data: new SlashCommandBuilder()
        .setName('lyrics')
        .setDescription('📄 Mostra a letra da música atual ou de uma música especificada.')
        .addStringOption(option => option.setName('musica').setDescription('Nome da música (opcional)')),
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        const query = interaction.options.getString('musica');
        let title = query;

        if (!title) {
            const queue = client.player.nodes.get(interaction.guildId!);
            const track = queue!.currentTrack;

            if(!(await requireCurrentTrack(queue, interaction))) return;

            title = track!.title;
        }
        // Stub: Replace with real lyrics fetching logic
        const lyrics = `Letra de **${title}** não encontrada ou não implementada.`;

        const embed = musicEmbed('Letra', lyrics);
        await interactionReply({
            interaction,
            content: { embeds: [embed] }
        });
    }
}); 