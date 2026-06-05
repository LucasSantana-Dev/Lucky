import { EmbedBuilder } from 'discord.js'
import { buildErrorSupportContext } from '@lucky/shared/utils/support'
import { createUserFriendlyError } from '@lucky/shared/utils/general/errorSanitizer'
import { errorEmbed } from './embeds'

export interface BuildCommandErrorEmbedContext {
    guildId?: string
    command?: string
    errorCategory?: string
}

/**
 * Builds a user-facing error embed for an already-minted correlation id: a
 * sanitized message, a markdown "Report this error" support link in the
 * description when SUPPORT_URL is configured, and the plain-text Error ID in
 * the footer (Discord footers do not render markdown links).
 *
 * The caller owns minting/tagging/logging the correlation id so it is recorded
 * for Sentry even when no embed is shown (deferred / already-replied paths).
 *
 * @param error The error to report
 * @param correlationId The correlation id to surface and correlate with logs/Sentry
 * @param context Optional context (guildId, command, errorCategory) for the support link
 * @returns The error EmbedBuilder
 */
export function buildCommandErrorEmbed(
    error: unknown,
    correlationId: string,
    context: BuildCommandErrorEmbedContext = {},
): EmbedBuilder {
    const userMessage = createUserFriendlyError(error)
    const { supportLink } = buildErrorSupportContext(correlationId, context)

    const description = supportLink
        ? `${userMessage}\n\n[🛟 Report this error](${supportLink})`
        : userMessage

    const embed = errorEmbed('Error', description)
    embed.setFooter({ text: `Error ID: ${correlationId}` })

    return embed
}
