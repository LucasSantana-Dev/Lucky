import { SlashCommandBuilder } from '@discordjs/builders';
import Command from '../../../models/Command';
import { interactionReply } from '../../../utils/general/interactionReply';
import { errorEmbed, successEmbed } from '../../../utils/general/embeds';
import { CommandExecuteParams } from '../../../types/CommandData';
import { requireGuild, requireQueue, requireCurrentTrack, requireIsPlaying } from '../../../utils/command/commandValidations';

export default new Command({
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('🔊 Define ou mostra o volume da reprodução.')
        .addIntegerOption(option => option.setName('value').setDescription('Volume (1-100)')),
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return;

        const queue = client.player.nodes.get(interaction.guildId!);
        if (!(await requireQueue(queue, interaction))) return;

        if (!(await requireCurrentTrack(queue, interaction))) return;
        if (!(await requireIsPlaying(queue, interaction))) return;

        const value = interaction.options.getInteger('valor');
        if (value === null) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [successEmbed('Volume atual', `🔊 O volume está em ${queue!.node.volume || 100}%`)]
                }
            });
            return;
        }
        if (value < 1 || value > 100) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [errorEmbed('Erro', '🔊 O volume deve ser entre 1 e 100!')]
                }
            });
            return;
        }
        queue!.node.setVolume(value);
        await interactionReply({
            interaction,
            content: {
                embeds: [successEmbed('Volume alterado', `🔊 O volume foi definido para ${value}%`)]
            }
        });
    }
}); 