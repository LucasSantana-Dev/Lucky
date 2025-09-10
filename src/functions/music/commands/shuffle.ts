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
        .setName("shuffle")
        .setDescription("🔀 Embaralha a fila de músicas."),
    category: "music",
    execute: async ({ client, interaction }: ICommandExecuteParams) => {
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
                            "Erro",
                            "🔀 A fila precisa ter pelo menos 2 músicas para ser embaralhada!",
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
                        "Fila embaralhada",
                        "🔀 A fila de músicas foi embaralhada com sucesso!",
                    ),
                ],
            },
        })
    },
})
