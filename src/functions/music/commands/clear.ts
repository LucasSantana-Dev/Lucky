import { SlashCommandBuilder } from "@discordjs/builders"
import { errorEmbed, successEmbed } from "../../../utils/general/embeds"
import { interactionReply } from "../../../utils/general/interactionReply"
import { debugLog, errorLog } from "../../../utils/general/log"
import Command from "../../../models/Command"
import {
    requireGuild,
    requireQueue,
} from "../../../utils/command/commandValidations"
import type { CommandExecuteParams } from "../../../types/CommandData"

export default new Command({
    data: new SlashCommandBuilder()
        .setName("clear")
        .setDescription("🗑️ Clear the music queue"),
    category: "music",
    execute: async ({
        client,
        interaction,
    }: CommandExecuteParams): Promise<void> => {
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
                                "Empty queue",
                                "🗑️ The queue is already empty!",
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
                            "Queue cleared",
                            `🗑️ Removed ${trackCount} songs from the queue!`,
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
                            "Error",
                            "🔄 An error occurred while clearing the queue!",
                        ),
                    ],
                    ephemeral: true,
                },
            })
        }
    },
})
