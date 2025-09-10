import type {
    ChatInputCommandInteraction,
    InteractionReplyOptions as DjsInteractionReplyOptions,
} from "discord.js"
import { errorLog } from "./log"

/**
 * Helper function to reply to a deferred interaction
 * This should be used when the interaction has already been deferred
 */
export const deferredInteractionReply = async (
    interaction: ChatInputCommandInteraction,
    options: Omit<DjsInteractionReplyOptions, "flags">,
): Promise<void> => {
    try {
        if (!interaction.deferred && !interaction.replied) {
            // If not deferred, defer first
            await interaction.deferReply({
                flags: (options as { ephemeral?: boolean }).ephemeral
                    ? 64
                    : undefined,
            })
        }

        if (interaction.replied) {
            // If already replied, use followUp
            await interaction.followUp(options)
        } else {
            // If deferred but not replied, use editReply
            await interaction.editReply(options)
        }
    } catch (error) {
        errorLog({
            message: "Error sending deferred interaction reply:",
            error,
        })
    }
}
