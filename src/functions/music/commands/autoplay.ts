import { SlashCommandBuilder } from '@discordjs/builders';
import Command from '../../../models/Command';
import { interactionReply } from '../../../utils/general/interactionReply';
import { createEmbed, EMBED_COLORS, EMOJIS } from '../../../utils/general/embeds';
import { QueueRepeatMode } from 'discord-player';
import { requireGuild, requireQueue } from '../../../utils/command/commandValidations';
import { CommandExecuteParams } from '../../../types/CommandData';
import { messages } from '../../../utils/general/messages';
import { ColorResolvable } from 'discord.js';

export default new Command({
    data: new SlashCommandBuilder()
        .setName("autoplay")
        .setDescription("🔄 Ativa ou desativa a reprodução automática de músicas relacionadas."),
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return;

        const queue = client.player.nodes.get(interaction.guildId!);
        if (!(await requireQueue(queue, interaction))) return;

        try {
            const isAutoplayEnabled = queue!.repeatMode === QueueRepeatMode.AUTOPLAY;
            queue!.setRepeatMode(isAutoplayEnabled ? QueueRepeatMode.OFF : QueueRepeatMode.AUTOPLAY);

            await interactionReply({
                interaction,
                content: {
                    embeds: [createEmbed({
                        title: isAutoplayEnabled ? 'Reprodução automática desativada' : 'Reprodução automática ativada',
                        description: isAutoplayEnabled 
                            ? 'A reprodução automática foi desativada. O bot não irá mais adicionar músicas relacionadas automaticamente.'
                            : 'A reprodução automática foi ativada. O bot irá adicionar músicas relacionadas automaticamente quando a fila estiver vazia.',
                        color: EMBED_COLORS.AUTOPLAY as ColorResolvable,
                        emoji: EMOJIS.AUTOPLAY,
                        timestamp: true
                    })],
                },
            });
        } catch (error) {
            console.error('Error in autoplay command:', error);
            await interactionReply({
                interaction,
                content: {
                    embeds: [createEmbed({
                        title: 'Erro',
                        description: messages.error.notPlaying,
                        color: EMBED_COLORS.ERROR as ColorResolvable,
                        emoji: EMOJIS.ERROR
                    })],
                    ephemeral: true
                }
            });
        }
    }
}); 