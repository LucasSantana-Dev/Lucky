import { SlashCommandBuilder } from "@discordjs/builders"
import Command from "../../../models/Command"
import { interactionReply } from "../../../utils/general/interactionReply"
import { musicEmbed } from "../../../utils/general/embeds"
import type { ICommandExecuteParams } from "../../../types/CommandData"
import { requireCurrentTrack } from "../../../utils/command/commandValidations"

export default new Command({
    data: new SlashCommandBuilder()
        .setName("lyrics")
        .setDescription(
            "📄 Show the lyrics of the current song or a specified song.",
        )
        .addStringOption((option) =>
            option.setName("musica").setDescription("Song name (optional)"),
        ),
    category: "music",
    execute: async ({ client, interaction }: ICommandExecuteParams) => {
        const query = interaction.options.getString("musica")
        let title = query

        if (!title) {
            const queue = client.player.nodes.get(interaction.guildId ?? "")
            const track = queue?.currentTrack

            if (!(await requireCurrentTrack(queue, interaction))) return

            title = track?.title ?? "Unknown"
        }
        const lyrics = `Lyrics for **${title}** not found or not implemented.`

        const embed = musicEmbed("Lyrics", lyrics)
        await interactionReply({
            interaction,
            content: { embeds: [embed] },
        })
    },
})
