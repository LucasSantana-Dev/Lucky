import type {
    ChatInputCommandInteraction,
    CommandInteractionOptionResolver,
    Interaction,
    InteractionType,
} from "discord.js"
import { Events } from "discord.js"
import { errorLog, debugLog } from "../utils/general/log"
import { executeCommand } from "./commandsHandler"
import type { ICustomClient } from "../types"
import { errorEmbed } from "../utils/general/embeds"
import { interactionReply } from "../utils/general/interactionReply"
import { monitorInteractionHandling } from "../utils/monitoring"
import { createUserFriendlyError } from "../utils/general/errorSanitizer"

interface HandleInteractionsParams {
    client: ICustomClient
}

interface InteractionGetOptionParams {
    interaction: ChatInputCommandInteraction
    optionName: string
}

interface InteractionGetSubcommandParams {
    interaction: ChatInputCommandInteraction
}

const interactionHandlers = new Map<
    InteractionType,
    (interaction: Interaction) => Promise<void>
>()

export const handleInteractions = async ({
    client,
}: HandleInteractionsParams): Promise<void> => {
    try {
        client.on(
            Events.InteractionCreate,
            async (interaction: Interaction) => {
                try {
                    const handlerKey = interaction.type
                    let handler = interactionHandlers.get(handlerKey)

                    if (!handler) {
                        handler = async (_interaction: Interaction) => {
                            if (interaction.isChatInputCommand()) {
                                await handleInteraction(interaction, client)
                            }
                        }
                        interactionHandlers.set(handlerKey, handler)
                    }

                    await handler(interaction)
                } catch (error) {
                    errorLog({ message: "Error handling interaction:", error })
                }
            },
        )

        debugLog({ message: "Interaction handler set up successfully" })
    } catch (error) {
        errorLog({ message: "Error setting up interaction handler:", error })
    }
}

export const interactionGetAllOptions = async ({
    interaction,
}: {
    interaction: ChatInputCommandInteraction
}): Promise<
    Omit<CommandInteractionOptionResolver, "getMessage" | "getFocused">
> => {
    try {
        return interaction.options
    } catch (error) {
        errorLog({ message: "Error getting interaction options:", error })
        throw error
    }
}

export const interactionGetOption = async ({
    interaction,
    optionName,
}: InteractionGetOptionParams) => {
    try {
        return interaction.options.get(optionName)
    } catch (error) {
        errorLog({ message: "Error getting interaction option:", error })
        throw error
    }
}

export const interactionGetSubcommand = async ({
    interaction,
}: InteractionGetSubcommandParams): Promise<string> => {
    try {
        return interaction.options.getSubcommand()
    } catch (error) {
        errorLog({ message: "Error getting interaction subcommand:", error })
        throw error
    }
}

export async function handleInteraction(
    interaction: Interaction,
    client: ICustomClient,
): Promise<void> {
    await monitorInteractionHandling(interaction, client, async () => {
        if (interaction.isChatInputCommand()) {
            await executeCommand({ interaction, client })
        }
    }).catch(async (error) => {
        errorLog({ message: "Error handling interaction:", error })

        try {
            if (
                interaction.isChatInputCommand() &&
                !interaction.replied &&
                !interaction.deferred
            ) {
                const userFriendlyError = createUserFriendlyError(error)
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [errorEmbed("Error", userFriendlyError)],
                        ephemeral: true,
                    },
                })
            }
        } catch (error) {
            errorLog({ message: "Error sending error message:", error })
        }
    })
}
