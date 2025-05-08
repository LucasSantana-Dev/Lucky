import { SlashCommandBuilder } from '@discordjs/builders';
import Command from '../../../models/Command';
import { interactionReply } from '../../../utils/general/interactionReply';
import { CommandExecuteParams } from '../../../types/CommandData';
import { requireQueue } from '../../../utils/command/commandValidations';

export default new Command({
    data: new SlashCommandBuilder()
        .setName("stop")
        .setDescription("⏹️ Para a reprodução e limpa a fila."),
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        const queue = client.player.nodes.get(interaction.guildId!);

        if (!(await requireQueue(queue, interaction))) return;

        queue!.delete();

        await interactionReply({
            interaction,
            content: {
                content: "⏹️ A reprodução foi interrompida e a fila foi limpa."
            }
        });
    }
}); 