import { SlashCommandBuilder } from "@discordjs/builders"
import Command from "../../../models/Command"
import { interactionReply } from "../../../utils/general/interactionReply"
import { errorEmbed, successEmbed } from "../../../utils/general/embeds"
import {
    requireGuild,
    requireQueue,
    requireCurrentTrack,
} from "../../../utils/command/commandValidations"
import type { CommandExecuteParams } from "../../../types/CommandData"

export default new Command({
    data: new SlashCommandBuilder()
        .setName("shuffle")
        .setDescription("🔀 Shuffle the music queue."),
    category: "music",
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return
        const queue = client.player.nodes.get(interaction.guildId ?? "")
        if (!(await requireQueue(queue, interaction))) return
        if (!(await requireCurrentTrack(queue, interaction))) return
        if ((queue?.tracks.size ?? 0) < 2) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        errorEmbed(
                            "Error",
                            "🔀 The queue needs at least 2 songs to be shuffled!",
                        ),
                    ],
                },
            })
            return
        }
        queue?.tracks.shuffle()
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    successEmbed(
                        "Queue shuffled",
                        "🔀 The music queue has been shuffled successfully!",
                    ),
                ],
            },
        })
    },
})
