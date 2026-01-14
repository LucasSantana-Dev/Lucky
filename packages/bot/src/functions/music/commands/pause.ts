import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { interactionReply } from "../../../utils/general/interactionReply"
import type { CommandExecuteParams } from "../../../types/CommandData"
import { requireQueue } from "../../../utils/command/commandValidations"

export default new Command({
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('⏸️ Pause the current music.'),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        const queue = client.player.nodes.get(interaction.guildId ?? '')

        if (!(await requireQueue(queue, interaction))) return

        if (queue?.node.isPaused() === true) {
            await interactionReply({
                interaction,
                content: {
                    content: '⏸️ Music is already paused.',
                },
            })
            return
        }

        queue?.node.pause()

        await interactionReply({
            interaction,
            content: {
                content: '⏸️ Music has been paused.',
            },
        })
    },
})
