import { SlashCommandBuilder } from "@discordjs/builders"
import Command from "../../../models/Command"
import { interactionReply } from "../../../utils/general/interactionReply"
import { errorEmbed, successEmbed } from "../../../utils/general/embeds"
import {
    requireGuild,
    requireQueue,
    requireCurrentTrack,
} from "../../../utils/command/commandValidations"
import type { ICommandExecuteParams } from "../../../types/CommandData"

export default new Command({
    data: new SlashCommandBuilder()
        .setName("move")
        .setDescription("🔀 Move a song to another position in the queue.")
        .addIntegerOption((option) =>
            option
                .setName("from")
                .setDescription("Current position (1 = next)")
                .setRequired(true),
        )
        .addIntegerOption((option) =>
            option
                .setName("to")
                .setDescription("New position (1 = next)")
                .setRequired(true),
        ),
    category: "music",
    execute: async ({ client, interaction }: ICommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return
        const queue = client.player.nodes.get(interaction.guildId ?? "")
        if (!(await requireQueue(queue, interaction))) return
        if (!(await requireCurrentTrack(queue, interaction))) return

        const from = interaction.options.getInteger("from", true) - 1
        const to = interaction.options.getInteger("to", true) - 1

        if (queue?.tracks.size === 0) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [errorEmbed("Error", "The queue is empty!")],
                },
            })
            return
        }

        if (
            from < 0 ||
            from >= (queue?.tracks.size ?? 0) ||
            to < 0 ||
            to >= (queue?.tracks.size ?? 0)
        ) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [errorEmbed("Error", "Invalid position!")],
                },
            })
            return
        }

        const tracks = queue?.tracks.toArray() ?? []
        const [moved] = tracks.splice(from, 1)
        tracks.splice(to, 0, moved)
        queue?.tracks.clear()
        queue?.tracks.add(tracks)

        await interactionReply({
            interaction,
            content: {
                embeds: [
                    successEmbed(
                        "Song moved",
                        `Moved: **${moved.title}** to position ${to + 1}`,
                    ),
                ],
            },
        })
    },
})
