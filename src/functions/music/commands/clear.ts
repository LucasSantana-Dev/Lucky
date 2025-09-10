import { SlashCommandBuilder } from "@discordjs/builders"
import { errorEmbed, successEmbed } from "../../../utils/general/embeds"
import { interactionReply } from "../../../utils/general/interactionReply"
import { debugLog, errorLog } from "../../../utils/general/log"
import Command from "../../../models/Command"
import {
    requireGuild,
    requireQueue,
} from "../../../utils/command/commandValidations"
import type { ICommandExecuteParams } from "../../../types/CommandData"

export default new Command({
    data: new SlashCommandBuilder()
        .setName("clear")
        .setDescription("🗑️ Limpa a fila de músicas"),
    category: "music",
    execute: async ({
        client,
        interaction,
    }: ICommandExecuteParams): Promise<void> => {
        if (!(await requireGuild(interaction))) return

        const queue = client.player.nodes.get(interaction.guildId ?? "")
        if (!(await requireQueue(queue, interaction))) return

        try {
            if (queue?.tracks.size === 0) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            errorEmbed(
                                "Fila vazia",
                                "🗑️ A fila já está vazia!",
                            ),
                        ],
                        ephemeral: true,
                    },
                })
                return
            }

            const trackCount = queue?.tracks.size ?? 0

            queue?.clear()

            debugLog({
                message: `Cleared ${trackCount} tracks from queue in guild ${interaction.guildId}`,
            })

            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        successEmbed(
                            "Fila limpa",
                            `🗑️ Removidas ${trackCount} músicas da fila!`,
                        ),
                    ],
                },
            })
        } catch (error) {
            errorLog({ message: "Error in clear command:", error })
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        errorEmbed(
                            "Erro",
                            "🔄 Ocorreu um erro ao limpar a fila!",
                        ),
                    ],
                    ephemeral: true,
                },
            })
        }
    },
})
