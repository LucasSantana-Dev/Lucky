import type { Client, Interaction } from "discord.js"
import { Events } from "discord.js"
import type { CustomClient } from "../types"
import { errorLog, infoLog, debugLog } from "../utils/general/log"
import { interactionReply } from "../utils/general/interactionReply"
import { createUserFriendlyError } from "../utils/general/errorSanitizer"

export default function handleEvents(client: Client) {
    client.once("clientReady", () => {
        infoLog({ message: `Logged in as ${client.user?.tag}!` })
        debugLog({
            message: `Bot is ready with ${(client as CustomClient).commands.size} commands loaded`,
        })
    })

    client.on(Events.InteractionCreate, async (interaction: Interaction) => {
        try {
            if (!interaction.isChatInputCommand()) return

            const command = (client as CustomClient).commands.get(
                interaction.commandName,
            )
            if (!command) {
                infoLog({
                    message: `Command ${interaction.commandName} not found`,
                })
                if (!interaction.replied && !interaction.deferred) {
                    await interactionReply({
                        interaction,
                        content: {
                            content: "This command is not available.",
                            ephemeral: true,
                        },
                    })
                }
                return
            }

            await command.execute({
                client: client as CustomClient,
                interaction,
            })
        } catch (error) {
            errorLog({ message: "Error handling interaction:", error })
            try {
                if (!interaction.isChatInputCommand()) return

                if (!interaction.replied && !interaction.deferred) {
                    const userFriendlyError = createUserFriendlyError(error)
                    await interactionReply({
                        interaction,
                        content: {
                            content: userFriendlyError,
                            ephemeral: true,
                        },
                    })
                } else {
                    const userFriendlyError = createUserFriendlyError(error)
                    await interactionReply({
                        interaction,
                        content: {
                            content: userFriendlyError,
                            ephemeral: true,
                        },
                    })
                }
            } catch (followUpError) {
                errorLog({
                    message: "Error sending error message:",
                    error: followUpError,
                })
            }
        }
    })

    client.on(Events.Error, (error) => {
        errorLog({ message: "Discord client error:", error })
    })

    client.on(Events.Warn, (warning) => {
        infoLog({ message: "Discord client warning:", data: warning })
    })

    client.on(Events.Debug, (debug) => {
        debugLog({ message: "Discord client debug:", data: debug })
    })

    client.on(Events.GuildDelete, (guild) => {
        try {
            const {
                clearHistory,
                clearAllGuildCaches,
            } = require("../utils/music/duplicateDetection")
            clearHistory(guild.id)
            clearAllGuildCaches(guild.id)
        } catch (err) {
            errorLog({
                message: "Error clearing history on guild delete:",
                error: err,
            })
        }
    })
}
