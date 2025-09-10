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
        .setDescription(
            "🔁 Define o modo de repetição com opções de tempo ou infinito.",
        )
        .addStringOption((option) =>
            option
                .setName("modo")
                .setDescription("Tipo de repetição")
                .setRequired(true)
                .addChoices(
                    { name: "off - Desligar", value: "off" },
                    { name: "track - Repetir música atual", value: "track" },
                    { name: "queue - Repetir fila", value: "queue" },
                    {
                        name: "infinite - Repetir infinitamente",
                        value: "infinite",
                    },
                ),
        )
        .addIntegerOption((option) =>
            option
                .setName("vezes")
                .setDescription(
                    "Número de vezes para repetir (1-100, apenas para track/queue)",
                )
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(false),
        ),
    category: "music",
    execute: async ({ client, interaction }: ICommandExecuteParams) => {
        const queue = client.player.nodes.get(interaction.guildId ?? "")
        const mode = interaction.options.getString("modo", true)
        const times = interaction.options.getInteger("vezes", false)

        if (!(await requireQueue(queue, interaction))) return

        const guildId = interaction.guildId ?? ""

        // Clear any existing repeat count
        guildRepeatCounts.delete(guildId)

        let repeatMode: QueueRepeatMode = QueueRepeatMode.OFF
        let description = ""

        if (mode === "off") {
            repeatMode = QueueRepeatMode.OFF
            description = "Repetição **desligada**"
        } else if (mode === "track") {
            repeatMode = QueueRepeatMode.TRACK
            if (times && times > 1) {
                guildRepeatCounts.set(guildId, {
                    count: times,
                    originalMode: repeatMode,
                })
                description = `Repetindo música atual **${times} vezes**`
            } else {
                description = "Repetindo música atual **infinitamente**"
            }
        } else if (mode === "queue") {
            repeatMode = QueueRepeatMode.QUEUE
            if (times && times > 1) {
                guildRepeatCounts.set(guildId, {
                    count: times,
                    originalMode: repeatMode,
                })
                description = `Repetindo fila **${times} vezes**`
            } else {
                description = "Repetindo fila **infinitamente**"
            }
        } else if (mode === "infinite") {
            repeatMode = QueueRepeatMode.AUTOPLAY
            description = "Repetição **infinita** ativada (autoplay contínuo)"
        }

        queue?.setRepeatMode(repeatMode)

        await interactionReply({
            interaction,
            content: {
                embeds: [successEmbed("🔁 Modo de repetição", description)],
            },
        })
    },
})

// Export the guild repeat counts for use in player events
export { guildRepeatCounts }
