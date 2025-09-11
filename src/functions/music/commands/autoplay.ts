import { SlashCommandBuilder } from "@discordjs/builders"
import Command from "../../../models/Command"
import { interactionReply } from "../../../utils/general/interactionReply"
import {
    createEmbed,
    EMBED_COLORS,
    EMOJIS,
} from "../../../utils/general/embeds"
import { errorLog, debugLog } from "../../../utils/general/log"
import { QueueRepeatMode } from "discord-player"
import {
    requireGuild,
    requireQueue,
} from "../../../utils/command/commandValidations"
import type { ICommandExecuteParams } from "../../../types/CommandData"
import { messages } from "../../../utils/general/messages"
import type { ColorResolvable } from "discord.js"
import { replenishQueue } from "../../../utils/music/trackManagement"

export default new Command({
    data: new SlashCommandBuilder()
        .setName("autoplay")
        .setDescription(
            "🔄 Enable or disable automatic playback of related music.",
        ),
    category: "music",
    execute: async ({ client, interaction }: ICommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return

        const queue = client.player.nodes.get(interaction.guildId ?? "")
        if (!(await requireQueue(queue, interaction))) return

        try {
            const isAutoplayEnabled =
                queue?.repeatMode === QueueRepeatMode.AUTOPLAY

            if (isAutoplayEnabled) {
                // Disable autoplay
                queue?.setRepeatMode(QueueRepeatMode.OFF)

                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createEmbed({
                                title: "Autoplay disabled",
                                description:
                                    "Autoplay has been disabled. The bot will no longer automatically add related songs.",
                                color: EMBED_COLORS.AUTOPLAY as ColorResolvable,
                                emoji: EMOJIS.AUTOPLAY,
                                timestamp: true,
                            }),
                        ],
                    },
                })
            } else {
                // Enable autoplay
                queue?.setRepeatMode(QueueRepeatMode.AUTOPLAY)

                // If there's a current track, try to populate the queue with related tracks
                if (queue?.currentTrack) {
                    debugLog({
                        message:
                            "Autoplay enabled, attempting to populate queue with related tracks",
                        data: {
                            guildId: interaction.guildId,
                            currentTrack: queue.currentTrack.title,
                        },
                    })

                    try {
                        await replenishQueue(queue, true) // Force replenish when autoplay is enabled
                        debugLog({
                            message:
                                "Queue replenished after enabling autoplay",
                            data: {
                                guildId: interaction.guildId,
                                queueSize: queue.tracks.size,
                            },
                        })
                    } catch (replenishError) {
                        errorLog({
                            message:
                                "Error replenishing queue after enabling autoplay:",
                            error: replenishError,
                        })
                    }
                }

                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createEmbed({
                                title: "Autoplay enabled",
                                description:
                                    "Autoplay has been enabled. The bot will automatically add related songs when the queue is empty.",
                                color: EMBED_COLORS.AUTOPLAY as ColorResolvable,
                                emoji: EMOJIS.AUTOPLAY,
                                timestamp: true,
                            }),
                        ],
                    },
                })
            }
        } catch (error) {
            errorLog({ message: "Error in autoplay command:", error })
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createEmbed({
                            title: "Error",
                            description: messages.error.notPlaying,
                            color: EMBED_COLORS.ERROR as ColorResolvable,
                            emoji: EMOJIS.ERROR,
                        }),
                    ],
                    ephemeral: true,
                },
            })
        }
    },
})
