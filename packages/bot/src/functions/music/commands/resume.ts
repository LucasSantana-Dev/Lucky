import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { interactionReply } from "../../../utils/general/interactionReply"
import type { CommandExecuteParams } from "../../../types/CommandData"
import { requireQueue } from "../../../utils/command/commandValidations"
import { resolveGuildQueue } from '../../../utils/music/queueResolver'
import { createSuccessEmbed, createWarningEmbed } from '../../../utils/general/embeds'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('resume')
        .setDescription('▶️ Resume the paused music.'),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        const { queue } = resolveGuildQueue(client, interaction.guildId ?? '')

        if (!(await requireQueue(queue, interaction))) return

        if (queue !== null && queue !== undefined && !queue.node.isPaused()) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createWarningEmbed(
                            'Already playing',
                            '▶️ Music is already playing.',
                        ),
                    ],
                    ephemeral: true,
                },
            })
            return
        }

        queue?.node.resume()

        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createSuccessEmbed(
                        'Resumed',
                        '▶️ Music has been resumed.',
                    ),
                ],
            },
        })
    },
})
