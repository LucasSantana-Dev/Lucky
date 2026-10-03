import type { ButtonInteraction } from 'discord.js'
import { reminderService } from '@lucky/shared/services'
import { errorLog } from '@lucky/shared/utils'

/** Prefix for the "Stop this reminder" button's custom id
 * (`remind_stop:<reminderId>`). Built by reminderScheduler.ts. */
export const REMINDER_STOP_BUTTON_PREFIX = 'remind_stop:'

const ERROR_TEXT = '❌ Something went wrong while stopping this reminder.'

/**
 * "Stop this reminder" button on a recurring reminder (#2619). The channel
 * fallback message is public, so the user-scoped delete is the only access
 * check: `deleteOwned` only matches rows owned by the clicking user. A failed
 * delete gets one generic answer (no owner-vs-gone distinction) and never
 * touches the message, so a stranger cannot strip the owner's button.
 */
export async function handleReminderStopButton(
    interaction: ButtonInteraction,
): Promise<void> {
    let stopped = false
    try {
        const id = interaction.customId.slice(
            REMINDER_STOP_BUTTON_PREFIX.length,
        )
        if (!id) {
            await interaction.reply({
                content: '❌ This reminder button is invalid.',
                ephemeral: true,
            })
            return
        }

        // Ack before any DB call so the 3s interaction window can't expire.
        await interaction.deferUpdate()

        const deleted = await reminderService.deleteOwned(
            null,
            interaction.user.id,
            id,
        )
        if (!deleted) {
            await interaction.followUp({
                content: '❌ Reminder not found or already stopped.',
                ephemeral: true,
            })
            return
        }

        stopped = true
        await interaction.editReply({ components: [] })
        await interaction.followUp({
            content: "🛑 Reminder stopped. You won't get it again.",
            ephemeral: true,
        })
    } catch (error) {
        errorLog({
            message: 'remind_stop button error:',
            error,
            data: { userId: interaction.user.id, stopped },
        })
        // The reminder is already gone: an error message would mislead.
        if (stopped) return
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: ERROR_TEXT,
                    ephemeral: true,
                })
            } else {
                await interaction.reply({
                    content: ERROR_TEXT,
                    ephemeral: true,
                })
            }
        } catch (replyError) {
            errorLog({
                message: 'Failed to send error reply for remind_stop button:',
                error: replyError,
            })
        }
    }
}
