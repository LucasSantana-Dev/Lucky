import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { interactionReply } from "../../../utils/general/interactionReply"
import type { CommandExecuteParams } from "../../../types/CommandData"
import {
    requireQueue,
    requireVoiceChannel,
} from "../../../utils/command/commandValidations"
import { resolveGuildQueue } from '../../../utils/music/queueResolver'
import { successEmbed, warningEmbed } from '../../../utils/general/embeds'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('⏸️ Pause the current music.'),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        if (!(await requireVoiceChannel(interaction))) return

        const { queue } = resolveGuildQueue(client, interaction.guildId ?? '')

        if (!(await requireQueue(queue, interaction))) return

        if (queue?.node.isPaused() === true) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        warningEmbed(
                            'Already paused',
                            '⏸️ Music is already paused.',
                        ),
                    ],
                    ephemeral: true,
                },
            })
            return
        }

        queue?.node.pause()

        await interactionReply({
            interaction,
            content: {
                embeds: [
                    successEmbed(
                        'Paused',
                        '⏸️ Music has been paused.',
                    ),
                ],
            },
        })
    },
})
