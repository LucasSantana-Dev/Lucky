import { SlashCommandBuilder } from '@discordjs/builders'
import { debugLog, errorLog, infoLog } from '@lucky/shared/utils'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import {
    createErrorEmbed,
    createSuccessEmbed,
} from '../../../utils/general/embeds'
import {
    requireGuild,
    requireQueue,
} from '../../../utils/command/commandValidations'
import type { CommandExecuteParams } from '../../../types/CommandData'
import { resolveGuildQueue } from '../../../utils/music/queueResolver'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('leave')
        .setDescription('🚪 Leave the voice channel and clear the queue.'),
    category: 'music',
    execute: async ({
        client,
        interaction,
    }: CommandExecuteParams): Promise<void> => {
        if (!(await requireGuild(interaction))) return

        const { queue } = resolveGuildQueue(client, interaction.guildId ?? '')
        if (!(await requireQueue(queue, interaction))) return

        try {
            infoLog({
                message: `Executing leave command for ${interaction.user.tag}`,
            })
            debugLog({
                message: 'Exiting voice channel',
                data: { guildId: interaction.guildId },
            })
            queue?.delete()
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createSuccessEmbed(
                            'Goodbye!',
                            '🚪 Disconnected from the voice channel and cleared the queue.',
                        ),
                    ],
                },
            })
        } catch (error) {
            errorLog({ message: 'Error in leave command:', error })
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createErrorEmbed(
                            'Error',
                            'An error occurred while trying to leave the voice channel.',
                        ),
                    ],
                    ephemeral: true,
                },
            })
        }
    },
})
