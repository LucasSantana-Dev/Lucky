import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import type { CommandExecuteParams } from '../../../types/CommandData'
import {
    requireQueue,
    requireDJRole,
} from '../../../utils/command/commandValidations'
import { resolveGuildQueue } from '../../../utils/music/queueResolver'
import { createSuccessEmbed } from '../../../utils/general/embeds'
import { musicWatchdogService } from '../../../utils/music/watchdog'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('⏹️ Stop playback and clear the queue.'),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        const { queue } = resolveGuildQueue(client, interaction.guildId ?? '')

        if (!(await requireQueue(queue, interaction))) return
        if (!(await requireDJRole(interaction, interaction.guildId!))) return

        if (queue) musicWatchdogService.markIntentionalStop(queue.guild.id)
        queue?.node.stop()
        queue?.clear()
        queue?.delete()

        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createSuccessEmbed(
                        'Playback stopped',
                        '⏹️ Playback has been stopped and the queue has been cleared.',
                    ),
                ],
            },
        })
    },
})
