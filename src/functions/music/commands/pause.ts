import { SlashCommandBuilder } from '@discordjs/builders';
import Command from '../../../models/Command';
import { interactionReply } from '../../../utils/general/interactionReply';
import { CommandExecuteParams } from '../../../types/CommandData';
import { requireQueue } from '../../../utils/command/commandValidations';

export default new Command({
    data: new SlashCommandBuilder()
        .setName("pause")
        .setDescription("⏸️ Pausa a música atual."),
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        const queue = client.player.nodes.get(interaction.guildId!);

        if (!(await requireQueue(queue, interaction))) return;

        if (queue!.node.isPaused()) {
            await interactionReply({
                interaction,
                content: {
                    content: "⏸️ A música já está pausada."
                }
            });
            return;
        }

        queue!.node.pause();

        await interactionReply({
            interaction,
            content: {
                content: "⏸️ A música foi pausada."
            }
        });
    }
}); 