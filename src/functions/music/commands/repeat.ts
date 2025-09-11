import { SlashCommandBuilder } from "@discordjs/builders"
import { QueueRepeatMode } from "discord-player"
import Command from "../../../models/Command"
import { interactionReply } from "../../../utils/general/interactionReply"
import { successEmbed } from "../../../utils/general/embeds"
import type { ICommandExecuteParams } from "../../../types/CommandData"
import { requireQueue } from "../../../utils/command/commandValidations"

// Store repeat counts for each guild
const guildRepeatCounts = new Map<
    string,
    { count: number; originalMode: QueueRepeatMode }
>()

export default new Command({
    data: new SlashCommandBuilder()
        .setName("repeat")
        .setDescription("🔁 Set the repeat mode with time or infinite options.")
        .addStringOption((option) =>
            option
                .setName("mode")
                .setDescription("Repeat type")
                .setRequired(true)
                .addChoices(
                    { name: "off - Turn off", value: "off" },
                    { name: "track - Repeat current song", value: "track" },
                    { name: "queue - Repeat queue", value: "queue" },
                    {
                        name: "infinite - Repeat infinitely",
                        value: "infinite",
                    },
                ),
        )
        .addIntegerOption((option) =>
            option
                .setName("times")
                .setDescription(
                    "Number of times to repeat (1-100, only for track/queue)",
                )
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(false),
        ),
    category: "music",
    execute: async ({ client, interaction }: ICommandExecuteParams) => {
        const queue = client.player.nodes.get(interaction.guildId ?? "")
        const mode = interaction.options.getString("mode", true)
        const times = interaction.options.getInteger("times", false)

        if (!(await requireQueue(queue, interaction))) return

        const guildId = interaction.guildId ?? ""

        // Clear any existing repeat count
        guildRepeatCounts.delete(guildId)

        let repeatMode: QueueRepeatMode = QueueRepeatMode.OFF
        let description = ""

        if (mode === "off") {
            repeatMode = QueueRepeatMode.OFF
            description = "Repeat **turned off**"
        } else if (mode === "track") {
            repeatMode = QueueRepeatMode.TRACK
            if (times && times > 1) {
                guildRepeatCounts.set(guildId, {
                    count: times,
                    originalMode: repeatMode,
                })
                description = `Repeating current song **${times} times**`
            } else {
                description = "Repeating current song **infinitely**"
            }
        } else if (mode === "queue") {
            repeatMode = QueueRepeatMode.QUEUE
            if (times && times > 1) {
                guildRepeatCounts.set(guildId, {
                    count: times,
                    originalMode: repeatMode,
                })
                description = `Repeating queue **${times} times**`
            } else {
                description = "Repeating queue **infinitely**"
            }
        } else if (mode === "infinite") {
            repeatMode = QueueRepeatMode.AUTOPLAY
            description = "**Infinite** repeat activated (continuous autoplay)"
        }

        queue?.setRepeatMode(repeatMode)

        await interactionReply({
            interaction,
            content: {
                embeds: [successEmbed("🔁 Repeat mode", description)],
            },
        })
    },
})

// Export the guild repeat counts for use in player events
export { guildRepeatCounts }
