import { SlashCommandBuilder } from '@discordjs/builders'
import { debugLog, errorLog, infoLog } from '@lukbot/shared/utils'
import Command from '../../../models/Command'
import { interactionReply } from "../../../utils/general/interactionReply"
import { errorEmbed, successEmbed } from "../../../utils/general/embeds"
import {
    requireGuild,
    requireQueue,
} from "../../../utils/command/commandValidations"
import type { CommandExecuteParams } from "../../../types/CommandData"

export default new Command({
    data: new SlashCommandBuilder()
        .setName('leave')
        .setDescription('🚪 Sai do canal de voz e limpa a fila'),
    category: 'music',
    execute: async ({
        client,
        interaction,
    }: CommandExecuteParams): Promise<void> => {
        if (!(await requireGuild(interaction))) return

        const queue = client.player.nodes.get(interaction.guildId ?? '')
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
                        successEmbed(
                            '👋 Até logo!',
                            'Desconectei do canal de voz e limpei a fila.',
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
                        errorEmbed(
                            'Error',
                            'An error occurred while trying to leave the voice channel!',
                        ),
                    ],
                },
            })
        }
    },
})
