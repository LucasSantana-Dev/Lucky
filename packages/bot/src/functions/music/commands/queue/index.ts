import { SlashCommandBuilder } from '@discordjs/builders'
import { debugLog, errorLog } from '@lukbot/shared/utils'
// Removed unused import
import Command from '../../../../models/Command'
import {
    requireGuild,
    requireQueue,
} from '../../../../utils/command/commandValidations'
import type { CommandExecuteParams } from '../../../../types/CommandData'
import { createQueueEmbed, createQueueErrorEmbed } from './queueEmbed'
import { createErrorEmbed } from '../../../../utils/general/embeds'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('📋 Show the current music queue'),
    category: 'music',
    execute: async ({
        client,
        interaction,
    }: CommandExecuteParams): Promise<void> => {
        if (!(await requireGuild(interaction))) return

        const queue = client.player.nodes.get(interaction.guildId ?? '')
        if (!(await requireQueue(queue, interaction))) return

        try {
            debugLog({
                message: 'Queue status',
                data: { queueExists: !!queue },
            })

            // Create the queue embed
            if (!queue) {
                await interaction.editReply({
                    embeds: [createErrorEmbed('Error', 'No queue found')],
                })
                return
            }
            const embed = await createQueueEmbed(queue)

            await interaction.editReply({
                embeds: [embed],
            })

            debugLog({
                message: 'Queue command executed successfully',
                data: {
                    guildId: interaction.guildId,
                    userId: interaction.user.id,
                },
            })
        } catch (error) {
            errorLog({
                message: 'Error in queue command',
                error,
            })

            const errorEmbed = createQueueErrorEmbed(
                'Failed to retrieve queue information. Please try again.',
            )

            await interaction.editReply({
                embeds: [errorEmbed],
            })
        }
    },
})
