import { EmbedBuilder } from 'discord.js'
import {
    mintCorrelationId,
    tagCorrelationIdToSentry,
    buildErrorSupportContext,
} from '@lucky/shared/utils/support'
import { errorLog } from '@lucky/shared/utils'
import { createUserFriendlyError } from '@lucky/shared/utils/general/errorSanitizer'
import { errorEmbed } from './embeds'

export interface BuildCommandErrorEmbedContext {
    guildId?: string
    command?: string
    errorCategory?: string
}

export interface BuildCommandErrorEmbedResult {
    embed: EmbedBuilder
    correlationId: string
}

/**
 * Builds an error embed with a correlation ID, support link, and Sentry tagging.
 * The correlation ID is minted once per call and tagged to Sentry immediately.
 * The support link (if available) is included in the embed description as a markdown link.
 * The footer displays the plain-text Error ID.
 *
 * @param error The error to report
 * @param context Optional context for the error (guildId, command, errorCategory)
 * @returns An object with the EmbedBuilder and the minted correlationId
 */
export function buildCommandErrorEmbed(
    error: unknown,
    context: BuildCommandErrorEmbedContext = {},
): BuildCommandErrorEmbedResult {
    const correlationId = mintCorrelationId()
    tagCorrelationIdToSentry(correlationId)

    errorLog({
        message: 'Command error',
        error,
        data: {
            correlationId,
            ...context,
        },
    })

    const userMessage = createUserFriendlyError(error)
    const { supportLink } = buildErrorSupportContext(correlationId, context)

    const description = supportLink
        ? `${userMessage}\n\n[🛟 Report this error](${supportLink})`
        : userMessage

    const embed = errorEmbed('Error', description)
    embed.setFooter({ text: `Error ID: ${correlationId}` })

    return { embed, correlationId }
}
