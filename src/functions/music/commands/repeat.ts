import { SlashCommandBuilder } from '@discordjs/builders';
import { QueueRepeatMode } from 'discord-player';
import Command from '../../../models/Command';
import { interactionReply } from '../../../utils/general/interactionReply';
import { successEmbed } from '../../../utils/general/embeds';
import { CommandExecuteParams } from '../../../types/CommandData';
import { requireQueue } from '../../../utils/command/commandValidations';

export default new Command({
    data: new SlashCommandBuilder()
        .setName('repeat')
        .setDescription('🔁 Define o modo de repetição.')
        .addStringOption(option =>
            option.setName('modo')
                .setDescription('off, track, queue')
                .setRequired(true)
                .addChoices(
                    { name: 'off', value: 'off' },
                    { name: 'track', value: 'track' },
                    { name: 'queue', value: 'queue' }
                )
        ),
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        const queue = client.player.nodes.get(interaction.guildId!);
        const mode = interaction.options.getString('modo', true);

        if (!(await requireQueue(queue, interaction))) return;

        let repeatMode: QueueRepeatMode = QueueRepeatMode.OFF;

        if (mode === 'track') repeatMode = QueueRepeatMode.TRACK;
        else if (mode === 'queue') repeatMode = QueueRepeatMode.QUEUE;

        queue!.setRepeatMode(repeatMode);

        await interactionReply({
            interaction,
            content: {
                embeds: [successEmbed('Modo de repetição', `Modo definido para: **${mode}**`)]
            }
        });
    }
}); 