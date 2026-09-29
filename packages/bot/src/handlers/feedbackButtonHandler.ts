import type { ButtonInteraction } from 'discord.js'
import { translatorForInteraction } from '../i18n/translatorForInteraction'
import {
    openFeedbackModalAndAwaitSubmit,
    parseFeedbackReportCustomId,
    submitFeedback,
} from '../services/feedbackService'

/**
 * "Report this" button on a command-error reply (see commandsHandler.ts's
 * replyExecutionError). Opens the same feedback modal as `/feedback`, carrying
 * the failed command's name and its Sentry event id (when available) as
 * context (#2477).
 */
export async function handleFeedbackReportButton(
    interaction: ButtonInteraction,
): Promise<void> {
    // No DMs (decisions/2026-06-18-in-bot-growth.md). The button only ever
    // appears on a guild command's error reply, but guard defensively anyway.
    if (!interaction.guildId) return

    const parsed = parseFeedbackReportCustomId(interaction.customId)

    const t = await translatorForInteraction(interaction)
    const modalSubmit = await openFeedbackModalAndAwaitSubmit(interaction, t)
    if (!modalSubmit) return

    await submitFeedback(
        modalSubmit,
        {
            commandName: parsed?.commandName,
            sentryEventId: parsed?.sentryEventId,
        },
        t,
    )
}
