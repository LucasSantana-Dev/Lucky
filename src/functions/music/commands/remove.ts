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
        .setName("remove")
        .setDescription("❌ Remove a song from the queue by number.")
        .addIntegerOption((option) =>
            option
                .setName("position")
                .setDescription("Position of the song in the queue (1 = next)")
                .setRequired(true),
        ),
    category: "music",
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return
        const queue = client.player.nodes.get(interaction.guildId ?? "")
        if (!(await requireQueue(queue, interaction))) return
        if (!(await requireCurrentTrack(queue, interaction))) return

        const pos = interaction.options.getInteger("position", true) - 1

        if (queue?.tracks.size === 0) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [errorEmbed("Error", "The queue is empty!")],
                },
            })
            return
        }

        if (pos < 0 || pos >= (queue?.tracks.size ?? 0)) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [errorEmbed("Error", "Invalid position!")],
                },
            })
            return
        }

        const removed = queue?.tracks.toArray()[pos]
        if (!removed) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [errorEmbed("Error", "Song not found!")],
                },
            })
            return
        }

        queue?.tracks.remove((_, i) => i === pos)

        await interactionReply({
            interaction,
            content: {
                embeds: [
                    successEmbed(
                        "Song removed",
                        `Removed: **${removed.title}** by ${removed.author}`,
                    ),
                ],
            },
        })
    },
})
