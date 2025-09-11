import { SlashCommandBuilder } from "@discordjs/builders"
import Command from "../../../models/Command"
import { interactionReply } from "../../../utils/general/interactionReply"
import { errorEmbed, successEmbed } from "../../../utils/general/embeds"
import type { ICommandExecuteParams } from "../../../types/CommandData"
import {
    requireGuild,
    requireQueue,
    requireCurrentTrack,
    requireIsPlaying,
} from "../../../utils/command/commandValidations"

export default new Command({
    data: new SlashCommandBuilder()
        .setName("volume")
        .setDescription("🔊 Set or show the playback volume.")
        .addIntegerOption((option) =>
            option.setName("value").setDescription("Volume (1-100)"),
        ),
    category: "music",
    execute: async ({ client, interaction }: ICommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return

        const queue = client.player.nodes.get(interaction.guildId ?? "")
        if (!(await requireQueue(queue, interaction))) return

        if (!(await requireCurrentTrack(queue, interaction))) return
        if (!(await requireIsPlaying(queue, interaction))) return

        const value = interaction.options.getInteger("value")
        if (value === null) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        successEmbed(
                            "Current volume",
                            `🔊 Volume is at ${queue?.node.volume ?? 100}%`,
                        ),
                    ],
                },
            })
            return
        }
        if (value < 1 || value > 100) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        errorEmbed(
                            "Error",
                            "🔊 Volume must be between 1 and 100!",
                        ),
                    ],
                },
            })
            return
        }
        queue?.node.setVolume(value)
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    successEmbed(
                        "Volume changed",
                        `🔊 Volume set to ${value}%`,
                    ),
                ],
            },
        })
    },
})
