import type { ButtonInteraction } from 'discord.js'
import { reminderService } from '@lucky/shared/services'
import { errorLog } from '@lucky/shared/utils'

/** Prefix for the "Stop this reminder" button's custom id
 * (`remind_stop:<reminderId>`). Built by reminderScheduler.ts. */
export const REMINDER_STOP_BUTTON_PREFIX = 'remind_stop:'

const ERROR_TEXT = '❌ Something went wrong while stopping this reminder.'

/**
 * "Stop this reminder" button on a recurring reminder (#2619). The channel
 * fallback message is public, so the user-scoped delete IS the authorization:
 * `deleteOwned` only matches rows owned by the clicking user.
 */
export async function handleReminderStopButton(
    interaction: ButtonInteraction,
): Promise<void> {
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

        const deleted = await reminderService.deleteOwned(
            null,
            interaction.user.id,
            id,
        )
        if (deleted) {
            await interaction.update({ components: [] })
            await interaction.followUp({
                content: "🛑 Reminder stopped. You won't get it again.",
                ephemeral: true,
            })
            return
        }

        const existing = await reminderService.findById(id)
        if (existing) {
            await interaction.reply({
                content:
                    '❌ Only the person who set this reminder can stop it.',
                ephemeral: true,
            })
            return
        }

        await interaction.update({ components: [] })
        await interaction.followUp({
            content: 'This reminder was already stopped.',
            ephemeral: true,
        })
    } catch (error) {
        errorLog({
            message: 'remind_stop button error:',
            error,
            data: { userId: interaction.user.id },
        })
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
