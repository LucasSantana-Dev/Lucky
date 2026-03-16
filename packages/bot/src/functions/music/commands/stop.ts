import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { interactionReply } from "../../../utils/general/interactionReply"
import type { CommandExecuteParams } from "../../../types/CommandData"
import { requireQueue } from "../../../utils/command/commandValidations"
import { resolveGuildQueue } from '../../../utils/music/queueResolver'
import { successEmbed } from '../../../utils/general/embeds'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('⏹️ Stop playback and clear the queue.'),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        const { queue } = resolveGuildQueue(client, interaction.guildId ?? '')

        if (!(await requireQueue(queue, interaction))) return

        queue?.delete()

        await interactionReply({
            interaction,
            content: {
                embeds: [
                    successEmbed(
                        'Playback stopped',
                        '⏹️ Playback has been stopped and the queue has been cleared.',
                    ),
                ],
            },
        })
    },
})
